import { doc, getDocFromServer, runTransaction, type Firestore } from 'firebase/firestore';
import { marketSchema, parseWorkspace, storedSchema } from '../../shared/schema';
import type { InstrumentId, Workspace } from '../../shared/schema';
import { getInstrument } from '../../shared/catalog';

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
export async function loadMarket(db: Firestore, id: InstrumentId) {
  const snapshot = await getDocFromServer(doc(db, 'market', id));
  if (!snapshot.exists()) return null;
  const series = marketSchema.parse(snapshot.data());
  if (
    series.instrumentId !== id ||
    series.source === 'demo' ||
    series.currency !== getInstrument(id).currency
  )
    throw new Error('The market cache does not contain verified provider data.');
  return series;
}
