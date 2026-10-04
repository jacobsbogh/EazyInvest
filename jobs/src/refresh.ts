import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, terminate } from 'firebase/firestore';
import { instrumentIds, marketSchema } from '../../shared/schema.js';
import { getInstrument } from '../../shared/catalog.js';
import { fetchAlphaSeries, ProviderError } from './alpha-vantage.js';
import { fetchEcbHistory, withHistoricalFx } from './ecb.js';
import { dailyAllowance } from './budget.js';
import { seedRegistry, processRequests } from './requests.js';

async function main() {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'MARKET_SYNC_EMAIL',
    'MARKET_SYNC_PASSWORD',
    'ALPHA_VANTAGE_API_KEY',
  ] as const;
  if (required.some((key) => !process.env[key]))
    throw new Error('Configure the Firebase variables and market-sync secrets in GitHub Actions.');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('This workflow is for the configured live project only.');
  const app = initializeApp({
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  let failed = 0;
  let updated = 0;
  try {
    await signInWithEmailAndPassword(
      auth,
      process.env.MARKET_SYNC_EMAIL!,
      process.env.MARKET_SYNC_PASSWORD!,
    );
    const fxHistory = await fetchEcbHistory();
    const fx = fxHistory.at(-1)!;
    const credit = dailyAllowance(db);
    const fetchSeries = async (item: Parameters<typeof fetchAlphaSeries>[0]) =>
      withHistoricalFx(
        await fetchAlphaSeries(item, process.env.ALPHA_VANTAGE_API_KEY!, fx, credit),
        fxHistory,
      );
    await seedRegistry(db);
    // Bound discovery to three credits before history/reference updates so new
    // searches cannot be indefinitely starved by a growing price catalog.
    const searches = await processRequests(
      db,
      process.env.ALPHA_VANTAGE_API_KEY!,
      credit,
      fetchSeries,
      'search',
    );
    failed += searches.failed;
    if (searches.quota) return;
    // Owner-requested history receives priority over routine cache refreshes.
    const requested = await processRequests(
      db,
      process.env.ALPHA_VANTAGE_API_KEY!,
      credit,
      fetchSeries,
      'history',
    );
    failed += requested.failed;
    if (requested.quota) return;
    for (const id of instrumentIds) {
      try {
        const ref = doc(db, 'market', id);
        const current = await getDocFromServer(ref);
        const parsed = marketSchema.safeParse(current.data());
        if (
          parsed.success &&
          parsed.data.source === 'Alpha Vantage' &&
          parsed.data.instrumentId === id &&
          Date.now() - Date.parse(parsed.data.fetchedAt) >= 0 &&
          Date.now() - Date.parse(parsed.data.fetchedAt) < 72000000
        ) {
          const backfilled = withHistoricalFx(parsed.data, fxHistory);
          if (JSON.stringify(backfilled.points) !== JSON.stringify(parsed.data.points)) {
            // A recent valid provider cache needs no Alpha Vantage requests to
            // acquire dated FX. Keep its original fetchedAt and current quote.
            await setDoc(ref, backfilled);
            console.log(`${id}: recent cache backfilled with historical ECB FX`);
          } else console.log(`${id}: recent cache retained`);
          updated++;
          continue;
        }
        const fetched = await fetchAlphaSeries(
          getInstrument(id),
          process.env.ALPHA_VANTAGE_API_KEY!,
          fx,
          credit,
        );
        const series = withHistoricalFx(fetched, fxHistory);
        await setDoc(ref, series);
        updated++;
        console.log(
          `${id}: ${series.points.length} monthly observations, ${series.points[0].date} to ${series.points.at(-1)!.date}; quote ${series.quote!.date}; FX ${series.fxDate}.`,
        );
      } catch (error) {
        if (error instanceof ProviderError && error.reason === 'coverage') {
          console.log(
            `${id}: exact listing unavailable from the free provider; prior cache retained.`,
          );
          continue;
        }
        if (error instanceof ProviderError && error.reason === 'quota') {
          console.log('Free daily allowance used; remaining updates deferred.');
          return;
        }
        failed++;
        // Never print provider URLs, credential-bearing errors, or response bodies.
        console.error(
          `${id}: update failed; prior cache retained. Check coverage and writer permissions.`,
        );
      }
    }
  } finally {
    await signOut(auth);
    await terminate(db);
    await deleteApp(app);
  }
  if (failed || !updated) throw new Error('Market sync could not finish successfully.');
}
main().catch(() => {
  console.error(
    'Market sync incomplete. Check configured secrets, account access, and provider coverage.',
  );
  process.exitCode = 1;
});
