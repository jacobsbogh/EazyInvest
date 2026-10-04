import type { Instrument } from './instrument.js';
import type { MarketSeries } from './schema.js';

export const historyRefreshMs = 7 * 86400000;
// First published euro reference rate, verified in the ECB history feed.
export const ecbHistoryStart = '1999-01-04';
export function marketMatchesListing(series: MarketSeries, item: Instrument): boolean {
  return (
    series.instrumentId === item.id &&
    series.currency === item.currency &&
    series.source !== 'demo' &&
    (series.source === 'Yahoo Finance'
      ? series.providerSymbol ===
        (item.yahooSymbol ??
          (item.exchange === 'XETR'
            ? `${item.ticker}.DE`
            : item.currency === 'USD'
              ? item.ticker
              : undefined))
      : !item.providerSymbol || series.providerSymbol === item.providerSymbol)
  );
}
export function freshHistory(series: MarketSeries, item: Instrument, now = Date.now()): boolean {
  const age = now - Date.parse(series.fetchedAt);
  return marketMatchesListing(series, item) && age >= 0 && age < historyRefreshMs;
}
export function historyIsStale(series: MarketSeries, now = Date.now()): boolean {
  // Fetch time does not make an old or suspended listing's quote fresh.
  const priceDate = series.quote?.date ?? series.points.at(-1)!.date;
  return (
    now - Date.parse(priceDate) > historyRefreshMs ||
    now - Date.parse(series.fetchedAt) > historyRefreshMs
  );
}
