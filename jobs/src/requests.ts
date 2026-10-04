import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { discoverySchema, historyRequestSchema } from '../../shared/discovery.js';
import { instrumentSchema } from '../../shared/instrument.js';
import { instruments, type Instrument } from '../../shared/catalog.js';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import { ProviderError } from './alpha-vantage.js';
import { requestAlpha } from './alpha-client.js';
import { parseSearchResults } from './listings.js';
import { listingSymbol } from './listings.js';
import { freshHistory } from '../../shared/market-policy.js';
import { yahooSymbol } from './yahoo.js';

export async function seedRegistry(db: Firestore, catalog: Instrument[] = instruments) {
  for (const item of catalog)
    await setDoc(
      doc(db, 'instrumentRegistry', item.id),
      Object.fromEntries(
        Object.entries({
          ...item,
          providerSymbol: listingSymbol(item),
          yahooSymbol: yahooSymbol(item),
        }).filter(([, value]) => value !== undefined),
      ),
    );
}
export async function processRequests(
  db: Firestore,
  apiKey: string,
  credit: () => Promise<void>,
  fetchSeries: (item: Instrument) => Promise<MarketSeries>,
  kind: 'search' | 'history' = 'search',
  search?: (text: string) => Promise<Instrument[]>,
) {
  let failed = 0;
  // Ordered, bounded queues prevent an expanding catalog from exhausting reads.
  // The index is declared in firestore.indexes.json.
  const pendingSearches =
    kind === 'search'
      ? await getDocsFromServer(
          query(
            collection(db, 'discoveryRequests'),
            where('status', '==', 'pending'),
            orderBy('requestedAt'),
            limit(3),
          ),
        )
      : { docs: [] };
  for (const snapshot of pendingSearches.docs) {
    const request = discoverySchema.parse(snapshot.data());
    try {
      const results = search
        ? await search(request.query)
        : parseSearchResults(
            await requestAlpha(apiKey, credit, {
              function: 'SYMBOL_SEARCH',
              keywords: request.query,
            }),
          );
      await seedRegistry(db, results);
      await setDoc(snapshot.ref, {
        ...request,
        status: results.length ? 'ready' : 'unavailable',
        results,
        completedAt: new Date().toISOString(),
      });
      console.log('Search request completed.');
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'quota')
        return { failed, quota: true };
      failed++;
      // Keep transient failures pending for the next scheduled update.
      console.error('Search request deferred; provider or writer unavailable.');
    }
  }
  const pendingHistory =
    kind === 'history'
      ? await getDocsFromServer(
          query(
            collection(db, 'marketRequests'),
            where('status', '==', 'pending'),
            orderBy('requestedAt'),
            limit(2),
          ),
        )
      : { docs: [] };
  const readyHistory =
    kind === 'history' && pendingHistory.docs.length < 2
      ? await getDocsFromServer(
          query(
            collection(db, 'marketRequests'),
            where('status', '==', 'ready'),
            orderBy('completedAt'),
            limit(2),
          ),
        )
      : { docs: [] };
  // Rotate completed requests by their last check, rather than permanently
  // refreshing the first listings ever requested. Pending work has priority.
  const historyQueue = [...pendingHistory.docs, ...readyHistory.docs].slice(0, 2);
  for (const snapshot of historyQueue) {
    const request = historyRequestSchema.parse(snapshot.data());
    try {
      const definition = await getDocFromServer(
        doc(db, 'instrumentRegistry', request.instrumentId),
      );
      const item = instrumentSchema.parse(definition.data());
      if (item.id !== request.instrumentId) throw new Error('Listing identity mismatch.');
      const current = await getDocFromServer(doc(db, 'market', item.id));
      const cached = marketSchema.safeParse(current.data());
      if (!cached.success || !freshHistory(cached.data, item)) {
        const series = await fetchSeries(item);
        await setDoc(doc(db, 'market', item.id), series);
      }
      await setDoc(snapshot.ref, {
        ...request,
        status: 'ready',
        completedAt: new Date().toISOString(),
      });
      console.log(`${item.id}: requested history ready.`);
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'quota')
        return { failed, quota: true };
      if (error instanceof ProviderError && error.reason === 'coverage') {
        await setDoc(snapshot.ref, {
          ...request,
          status: 'unavailable',
          completedAt: new Date().toISOString(),
        });
        console.log(`${request.instrumentId}: requested listing unavailable; cache retained.`);
      } else {
        failed++;
        console.error('History request deferred; provider or writer unavailable.');
      }
    }
  }
  return { failed, quota: false };
}
