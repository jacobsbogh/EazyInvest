import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  limit,
  orderBy,
  documentId,
  startAfter,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { marketSchema, parseWorkspace, storedSchema } from '../../shared/schema.js';
import type { InstrumentId, Workspace } from '../../shared/schema.js';
import { instruments, type Instrument } from '../../shared/catalog.js';
import { instrumentSchema } from '../../shared/instrument.js';
import { marketMatchesListing } from '../../shared/market-policy.js';
import { quoteSchema, quoteMatchesListing, type MarketQuote } from '../../shared/quote.js';
import {
  discoverySchema,
  historyRequestSchema,
  searchQuerySchema,
} from '../../shared/discovery.js';

export async function loadWorkspace(db: Firestore, uid: string) {
  const snapshot = await getDocFromServer(doc(db, 'users', uid, 'workspace', 'current'));
  return snapshot.exists() ? storedSchema.parse(snapshot.data()) : null;
}
export async function saveWorkspace(
  db: Firestore,
  uid: string,
  input: Workspace,
  revision: number,
) {
  const data = parseWorkspace(input);
  if (new TextEncoder().encode(JSON.stringify(data)).length > 750_000)
    throw new Error('Workspace is too large. Export a backup and reduce the number of records.');
  const next = storedSchema.parse({ data, revision: revision + 1 });
  const ref = doc(db, 'users', uid, 'workspace', 'current');
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    if ((current.data()?.revision ?? 0) !== revision) {
      throw Object.assign(new Error('Workspace changed elsewhere.'), { code: 'aborted' });
    }
    transaction.set(ref, next);
  });
  return next;
}
export async function loadMarket(
  db: Firestore,
  id: InstrumentId,
  catalog: Instrument[] = instruments,
) {
  const snapshot = await getDocFromServer(doc(db, 'market', id));
  if (!snapshot.exists()) return null;
  const series = marketSchema.parse(snapshot.data());
  const item = catalog.find((item) => item.id === id);
  if (
    !item ||
    !marketMatchesListing(series, item) ||
    (series.reportedTrade &&
      (series.reportedTrade.isin !== item.isin || series.reportedTrade.mic !== item.mic))
  )
    throw new Error('The market cache does not contain verified provider data.');
  return series;
}

export async function loadRegistry(db: Firestore): Promise<Instrument[]> {
  const items: Instrument[] = [];
  let cursor: string | undefined;
  for (;;) {
    const result = await getDocsFromServer(
      query(
        collection(db, 'instrumentRegistry'),
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(100),
      ),
    );
    for (const snapshot of result.docs) {
      const item = instrumentSchema.parse(snapshot.data());
      if (item.id !== snapshot.id) throw new Error('Registry identity mismatch.');
      items.push(item);
    }
    if (result.size < 100) return items;
    if (items.length >= 2000) throw new Error('Registry exceeded the supported catalogue size.');
    cursor = result.docs.at(-1)!.id;
  }
}
export async function loadQuotes(
  db: Firestore,
  catalog: Instrument[] = instruments,
): Promise<MarketQuote[]> {
  const items: MarketQuote[] = [];
  let cursor: string | undefined;
  let count = 0;
  for (;;) {
    const result = await getDocsFromServer(
      query(
        collection(db, 'marketQuotes'),
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(100),
      ),
    );
    for (const snapshot of result.docs) {
      count++;
      const parsed = quoteSchema.safeParse(snapshot.data());
      const item = catalog.find((entry) => entry.id === snapshot.id);
      // A malformed/mismatched row must not hide other valid prices.
      if (parsed.success && item && quoteMatchesListing(parsed.data, item)) items.push(parsed.data);
    }
    if (result.size < 100) return items;
    if (count >= 2000) throw new Error('Quote cache exceeded the supported catalog size.');
    cursor = result.docs.at(-1)!.id;
  }
}
export async function searchMarkets(db: Firestore, input: string) {
  const text = searchQuerySchema.parse(input).toLowerCase();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const id = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const ref = doc(db, 'discoveryRequests', id);
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists()) {
      const cached = discoverySchema.parse(current.data());
      if (cached.status === 'pending' || Date.now() - Date.parse(cached.requestedAt) < 7 * 86400000)
        return cached;
    }
    const request = discoverySchema.parse({
      query: text,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
    transaction.set(ref, request);
    return request;
  });
}
export async function queueHistory(db: Firestore, instrumentId: string) {
  const ref = doc(db, 'marketRequests', instrumentId);
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists()) {
      const cached = historyRequestSchema.parse(current.data());
      if (cached.status === 'pending') return cached;
    }
    const request = historyRequestSchema.parse({
      instrumentId,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
    transaction.set(ref, request);
    return request;
  });
}
export async function loadHistoryRequests(db: Firestore, ids: string[]) {
  const results = await Promise.all(
    ids.map(async (id) => {
      const snapshot = await getDocFromServer(doc(db, 'marketRequests', id));
      return snapshot.exists() ? historyRequestSchema.parse(snapshot.data()) : null;
    }),
  );
  return results.filter((item) => item !== null);
}
