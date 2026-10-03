import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineBoolean } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import {
  instrumentIdSchema,
  marketSchema,
  parseWorkspace,
  storedSchema,
} from '../../shared/schema.js';
import type { InstrumentId } from '../../shared/schema.js';
import { getInstrument } from '../../shared/catalog.js';
import { fetchSeries } from './provider.js';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 });
const providerKey = defineSecret('TWELVE_DATA_API_KEY');
const refreshEnabled = defineBoolean('MARKET_REFRESH_ENABLED', { default: false });
async function ownerUid(): Promise<string> {
  const access = await db.doc('config/access').get();
  const uid = access.data()?.ownerUid;
  if (typeof uid !== 'string' || !uid.length)
    throw new HttpsError('permission-denied', 'The owner account has not been configured.');
  return uid;
}
async function assertOwner(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (uid !== (await ownerUid()))
    throw new HttpsError('permission-denied', 'This account does not have access.');
  return uid;
}
export const saveWorkspace = onCall({ timeoutSeconds: 30 }, async (request) => {
  const uid = await assertOwner(request.auth?.uid);
  let payload;
  try {
    payload = z
      .object({ revision: z.number().int().nonnegative(), data: z.unknown() })
      .strict()
      .parse(request.data);
    payload = { ...payload, data: parseWorkspace(payload.data) };
    if (Buffer.byteLength(JSON.stringify(payload.data)) > 750_000)
      throw new Error('Workspace is too large.');
  } catch {
    throw new HttpsError(
      'invalid-argument',
      'Workspace validation failed. Check the values and transaction history.',
    );
  }
  const next = storedSchema.parse({ data: payload.data, revision: payload.revision + 1 });
  const ref = db.doc(`users/${uid}/workspace/current`);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if ((current.data()?.revision ?? 0) !== payload.revision)
      throw new HttpsError('aborted', 'Workspace changed elsewhere. Reload before saving.');
    transaction.set(ref, next);
  });
  return next;
});

// Persistent shared counters bound provider spend even with concurrent instances.
async function consumeProviderCredit() {
  const ref = db.doc('internal/providerQuota');
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const old = doc.data() ?? {};
    const minuteCount =
      now - Number(old.minuteStart ?? 0) < 60000 ? Number(old.minuteCount ?? 0) : 0;
    const minuteStart = minuteCount ? old.minuteStart : now;
    const dailyCount = old.day === day ? Number(old.dailyCount ?? 0) : 0;
    if (minuteCount >= 8 || dailyCount >= 100)
      throw new HttpsError(
        'resource-exhausted',
        'The market-data request budget has been reached. Try again later.',
      );
    tx.set(ref, { minuteStart, minuteCount: minuteCount + 1, day, dailyCount: dailyCount + 1 });
  });
}
async function loadSeries(id: InstrumentId) {
  const ref = db.doc(`market/${id}`);
  const cached = await ref.get();
  if (cached.exists) {
    const parsed = marketSchema.safeParse(cached.data());
    if (
      parsed.success &&
      parsed.data.source === 'Twelve Data' &&
      Date.now() - Date.parse(parsed.data.fetchedAt) < 24 * 60 * 60 * 1000
    )
      return parsed.data;
  }
  // Lease prevents simultaneous refreshes of the same instrument from spending twice.
  const lockRef = db.doc(`internal/lease-${id}`);
  const token = crypto.randomUUID();
  await db.runTransaction(async (tx) => {
    const lock = await tx.get(lockRef);
    if (Number(lock.data()?.until ?? 0) > Date.now())
      throw new HttpsError(
        'resource-exhausted',
        'This investment is already refreshing. Try again shortly.',
      );
    tx.set(lockRef, { token, until: Date.now() + 60000 });
  });
  try {
    const key = providerKey.value();
    if (!key) throw new HttpsError('failed-precondition', 'Market data has not been connected.');
    const series = await fetchSeries(getInstrument(id), key, consumeProviderCredit);
    await ref.set(series);
    return series;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Provider URLs contain credentials: do not log raw exceptions or provider payloads.
    logger.warn('Market refresh failed', { instrumentId: id });
    throw new HttpsError(
      'unavailable',
      'The provider could not return valid data. Check coverage and subscription access.',
    );
  } finally {
    await db.runTransaction(async (tx) => {
      const lock = await tx.get(lockRef);
      if (lock.data()?.token === token) tx.delete(lockRef);
    });
  }
}
export const getMarketSeries = onCall(
  { secrets: [providerKey], timeoutSeconds: 60 },
  async (request) => {
    await assertOwner(request.auth?.uid);
    const parsed = z.object({ instrumentId: instrumentIdSchema }).strict().safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a supported investment.');
    return loadSeries(parsed.data.instrumentId);
  },
);
export const refreshDailyMarket = onSchedule(
  {
    schedule: '30 23 * * 1-5',
    timeZone: 'Europe/Copenhagen',
    secrets: [providerKey],
    timeoutSeconds: 300,
    retryCount: 0,
    maxInstances: 1,
  },
  async () => {
    if (!refreshEnabled.value()) return;
    const uid = await ownerUid();
    const snapshot = await db.doc(`users/${uid}/workspace/current`).get();
    if (!snapshot.exists) return;
    const workspace = storedSchema.parse(snapshot.data()).data;
    const ids = [
      ...new Set([
        ...workspace.watchlist.map((w) => w.instrumentId),
        ...workspace.transactions.map((t) => t.instrumentId),
      ]),
    ];
    for (const [index, id] of ids.entries()) {
      if (index) await new Promise((resolve) => setTimeout(resolve, 20000));
      try {
        await loadSeries(id);
      } catch {
        logger.warn('Scheduled market data update skipped', { instrumentId: id });
      }
    }
  },
);
