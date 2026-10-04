import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, terminate } from 'firebase/firestore';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import { instruments, type Instrument } from '../../shared/catalog.js';
import { instrumentSchema } from '../../shared/instrument.js';
import { freshHistory } from '../../shared/market-policy.js';
import { fetchAlphaSeries, ProviderError } from './alpha-vantage.js';
import { fetchEcbHistory, withHistoricalFx } from './ecb.js';
import { dailyAllowance } from './budget.js';
import { seedRegistry, processRequests } from './requests.js';
import { fetchYahooSeries, searchYahooListings } from './yahoo.js';
import {
  fetchDanishListings,
  enrichDanishListing,
  mergeDanishListings,
} from './danish-listings.js';
import { fetchNasdaqReferences, withNasdaqReference, nasdaqTradeInvalidated } from './nasdaq.js';
import { loadRegistry } from '../../src/lib/cloud.js';

async function main() {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'MARKET_SYNC_EMAIL',
    'MARKET_SYNC_PASSWORD',
  ];
  if (required.some((key) => !process.env[key]))
    throw new Error(
      'Configure Firebase variables and the restricted market writer. No paid data key is required.',
    );
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('Live refresh refuses emulator configuration.');
  const app = initializeApp({
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app),
    db = getFirestore(app);
  let failed = 0,
    updated = 0;
  try {
    await signInWithEmailAndPassword(
      auth,
      process.env.MARKET_SYNC_EMAIL!,
      process.env.MARKET_SYNC_PASSWORD!,
    );
    const registry = await loadRegistry(db);
    const catalog = new Map(instruments.map((item) => [item.id, item]));
    for (const item of registry) catalog.set(item.id, { ...catalog.get(item.id), ...item });
    try {
      const listings = await fetchDanishListings();
      const knownDanish = registry.filter(
        (item) => item.kind === 'Stock' && item.mic && item.referenceStatus !== 'retained',
      );
      if (listings.length < knownDanish.length * 0.75)
        throw new Error('Incomplete reference update.');
      const unmapped = listings.filter((reference) => !catalog.get(reference.id)?.yahooSymbol);
      // Rotate unmapped ISINs too: permanently missing symbols must not starve
      // newly listed companies. No approximate-name mapping is accepted.
      const offset = unmapped.length
        ? (Math.floor(Date.now() / 86400000) * 10) % unmapped.length
        : 0;
      const lookups = new Set(
        [...unmapped.slice(offset), ...unmapped.slice(0, offset)]
          .slice(0, 10)
          .map((item) => item.id),
      );
      for (const reference of mergeDanishListings(
        listings,
        [...catalog.values()].filter((item) => item.kind === 'Stock' && item.mic),
      )) {
        let item: Instrument = reference;
        if (!item.yahooSymbol && lookups.has(item.id)) item = await enrichDanishListing(item);
        catalog.set(item.id, instrumentSchema.parse(item));
      }
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'quota') throw error;
      console.warn('Official listing refresh unavailable; retained the last verified catalogue.');
    }
    const previous = new Map(registry.map((item) => [item.id, JSON.stringify(item)]));
    await seedRegistry(
      db,
      [...catalog.values()].filter((item) => previous.get(item.id) !== JSON.stringify(item)),
    );
    const fxHistory = await fetchEcbHistory();
    let references: ReadonlyMap<string, NonNullable<MarketSeries['reportedTrade']>> = new Map();
    try {
      references = await fetchNasdaqReferences();
      console.log(`Nasdaq closing-session sample: ${references.size} Danish ISINs.`);
    } catch {
      console.warn('Exchange trade reference unavailable; retained saved references.');
    }
    const credit = dailyAllowance(db);
    const fetchSeries = async (item: Instrument) => {
      let series;
      try {
        series = await fetchYahooSeries(item, fxHistory);
      } catch (error) {
        if (
          !(error instanceof ProviderError) ||
          error.reason !== 'coverage' ||
          item.mic !== undefined ||
          item.currency === 'DKK' ||
          !process.env.ALPHA_VANTAGE_API_KEY
        )
          throw error;
        series = withHistoricalFx(
          await fetchAlphaSeries(
            item,
            process.env.ALPHA_VANTAGE_API_KEY,
            fxHistory.at(-1)!,
            credit,
          ),
          fxHistory,
        );
      }
      return withNasdaqReference(series, item, references);
    };
    const searches = await processRequests(db, '', credit, fetchSeries, 'search', (text) =>
      searchYahooListings(text, [...catalog.values()]),
    );
    failed += searches.failed;
    if (searches.quota) throw new ProviderError('quota');
    const requests = await processRequests(db, '', credit, fetchSeries, 'history');
    failed += requests.failed;
    if (requests.quota) throw new ProviderError('quota');
    // Import the whole Danish catalogue automatically. Weekly history freshness
    // avoids repeated downloads; exchange references are collected each run.
    for (const item of catalog.values()) {
      if (item.referenceStatus === 'retained') continue;
      if (!item.mic && !instruments.some((reference) => reference.id === item.id)) continue;
      const ref = doc(db, 'market', item.id);
      try {
        const snapshot = await getDocFromServer(ref);
        const cached = marketSchema.safeParse(snapshot.data());
        if (cached.success && freshHistory(cached.data, item)) {
          const refreshed = withNasdaqReference(
            withHistoricalFx(cached.data, fxHistory),
            item,
            references,
          );
          if (JSON.stringify(refreshed) !== JSON.stringify(cached.data))
            await setDoc(ref, refreshed);
          updated++;
          continue;
        }
        // A known cancellation remains valid even when a later price download
        // fails. Clear/replace its reference before refreshing stale history.
        if (
          cached.success &&
          cached.data.reportedTrade &&
          nasdaqTradeInvalidated(cached.data.reportedTrade, references)
        )
          await setDoc(ref, withNasdaqReference(cached.data, item, references));
        let series = await fetchSeries(item);
        if (
          !series.reportedTrade &&
          cached.success &&
          cached.data.reportedTrade &&
          cached.data.reportedTrade.isin === item.isin &&
          cached.data.reportedTrade.mic === item.mic &&
          !nasdaqTradeInvalidated(cached.data.reportedTrade, references)
        )
          series = marketSchema.parse({ ...series, reportedTrade: cached.data.reportedTrade });
        await setDoc(ref, series);
        updated++;
        console.log(
          `${item.id}: ${series.points.length} monthly observations; ${series.source}; quote ${series.quote!.date}.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        if (error instanceof ProviderError && error.reason === 'coverage') {
          console.log(`${item.id}: free history unavailable for this exact ISIN; cache retained.`);
          continue;
        }
        if (error instanceof ProviderError && error.reason === 'quota') throw error;
        failed++;
        console.error(`${item.id}: update failed; cache retained.`);
      }
    }
  } finally {
    await signOut(auth);
    await terminate(db);
    await deleteApp(app);
  }
  console.log(`History caches checked or updated: ${updated}; failed: ${failed}.`);
  if (failed || !updated) throw new Error('Market sync incomplete.');
}
main().catch(() => {
  console.error(
    'Market sync incomplete. Check public source availability and writer permissions; existing caches were retained.',
  );
  process.exitCode = 1;
});
