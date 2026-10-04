import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  limit,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { marketSchema, parseWorkspace, storedSchema } from '../../shared/schema';
import type { InstrumentId, Workspace } from '../../shared/schema';
import { instruments, type Instrument } from '../../shared/catalog';
import { instrumentSchema } from '../../shared/instrument';
import { discoverySchema, historyRequestSchema, searchQuerySchema } from '../../shared/discovery';

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
  if (
    series.instrumentId !== id ||
    series.source === 'demo' ||
    series.currency !== catalog.find((item) => item.id === id)?.currency ||
    (catalog.find((item) => item.id === id)?.providerSymbol !== undefined &&
      series.providerSymbol !== catalog.find((item) => item.id === id)?.providerSymbol)
  )
    throw new Error('The market cache does not contain verified provider data.');
  return series;
}

export async function loadRegistry(db: Firestore): Promise<Instrument[]> {
  const result = await getDocsFromServer(query(collection(db, 'instrumentRegistry'), limit(100)));
  return result.docs.map((item) => instrumentSchema.parse(item.data()));
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
