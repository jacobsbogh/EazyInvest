import { doc, getDocFromServer, setDoc, type Firestore } from 'firebase/firestore';
import type { Instrument } from '../../shared/instrument.js';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import { freshHistory, marketMatchesListing } from '../../shared/market-policy.js';
import {
  currentQuote,
  freshQuote,
  quoteFromSeries,
  quoteMatchesListing,
  quoteSchema,
  type MarketQuote,
  newerQuote,
} from '../../shared/quote.js';
import { withHistoricalFx, type FxRates } from './ecb.js';
import { withNasdaqReference } from './nasdaq.js';
import { ProviderError } from './alpha-vantage.js';

/** Quote failures and history failures retain independent valid caches. */
export async function refreshInstrument(
  db: Firestore,
  item: Instrument,
  fx: readonly FxRates[],
  references: ReadonlyMap<string, NonNullable<MarketSeries['reportedTrade']>>,
  fetchHistory: (item: Instrument) => Promise<MarketSeries>,
  fetchQuote: (item: Instrument) => Promise<MarketQuote>,
  now = new Date(),
) {
  const historyRef = doc(db, 'market', item.id);
  const parsed = marketSchema.safeParse((await getDocFromServer(historyRef)).data());
  let series =
    parsed.success &&
    marketMatchesListing(parsed.data, item) &&
    (!parsed.data.reportedTrade ||
      (parsed.data.reportedTrade.isin === item.isin && parsed.data.reportedTrade.mic === item.mic))
      ? parsed.data
      : undefined;
  let historyUpdated = false,
    failed = 0;
  if (series) {
    const referenced = withNasdaqReference(withHistoricalFx(series, fx), item, references);
    if (JSON.stringify(referenced) !== JSON.stringify(series)) await setDoc(historyRef, referenced);
    series = referenced;
  }
  if (!series || !freshHistory(series, item, now.getTime())) {
    try {
      let result = marketSchema.parse(await fetchHistory(item));
      if (!marketMatchesListing(result, item)) throw new Error('History identity mismatch.');
      if (!result.reportedTrade && series?.reportedTrade)
        result = marketSchema.parse({ ...result, reportedTrade: series.reportedTrade });
      series = withNasdaqReference(result, item, references);
      await setDoc(historyRef, series);
      historyUpdated = true;
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'quota') throw error;
      if (!(error instanceof ProviderError && error.reason === 'coverage')) failed++;
    }
  }
  const quoteRef = doc(db, 'marketQuotes', item.id);
  const saved = quoteSchema.safeParse((await getDocFromServer(quoteRef)).data());
  const previous = saved.success && quoteMatchesListing(saved.data, item) ? saved.data : undefined;
  let quote = currentQuote(series, previous);
  if (!quote || !freshQuote(quote, item, now)) {
    try {
      // A full Yahoo download already supplied the same day's raw quote.
      const candidate =
        historyUpdated && series?.source === 'Yahoo Finance'
          ? quoteFromSeries(series)
          : quoteSchema.parse(await fetchQuote(item));
      if (!candidate || !quoteMatchesListing(candidate, item))
        throw new Error('Quote identity mismatch.');
      // Provider metadata can regress during suspensions: never replace a newer
      // observation with an older one, or combine its price with different FX.
      quote = newerQuote(quote, candidate);
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'quota') throw error;
      if (!(error instanceof ProviderError && error.reason === 'coverage')) failed++;
    }
  }
  const quoteUpdated = !!quote && JSON.stringify(quote) !== JSON.stringify(previous);
  if (quoteUpdated) await setDoc(quoteRef, quote!);
  return {
    historyUpdated,
    quoteUpdated,
    failed,
    quoteDate: quote?.quote.date,
    observations: series?.points.length,
  };
}
