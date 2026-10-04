import type { InstrumentId, MarketSeries } from './schema.js';
import { historicalObservations } from './historical-series.js';
import { currentQuote, type MarketQuote } from './quote.js';

export function latestQuote(series: MarketSeries | undefined, quote?: MarketQuote) {
  return currentQuote(series, quote)?.quote;
}

// Compare month-end observations by month when every series is monthly. Exchanges
// can have different last trading days. Never interpolate or extend a fund's history.
export function historicalComparison(
  market: Partial<Record<InstrumentId, MarketSeries>>,
  selected: InstrumentId[],
  years: number | 'all',
  currency: 'native' | 'DKK' = 'native',
) {
  const observations = new Map(
    selected.map((id) => [id, historicalObservations(market[id], currency)]),
  );
  const available = selected.filter((id) => observations.get(id)!.points.length > 0);
  const missingFx = selected.some((id) => observations.get(id)!.missingFx);
  const monthly =
    available.length > 0 && available.every((id) => market[id]!.frequency === 'monthly');
  const adjusted = available.length > 0 && available.every((id) => observations.get(id)!.adjusted);
  // Preserve one honest basis for the whole comparison. A legacy price-only
  // series cannot be compared with adjusted levels under a price-only label.
  const comparisonObservations = new Map(
    available.map((id) => [
      id,
      adjusted
        ? observations.get(id)!
        : historicalObservations({ ...market[id]!, adjustment: undefined }, currency),
    ]),
  );
  const key = (day: string) => (monthly ? day.slice(0, 7) : day);
  const prices = new Map(
    available.map((id) => [
      id,
      new Map(comparisonObservations.get(id)!.points.map((p) => [key(p.date), p.value])),
    ]),
  );
  const common = [...(prices.get(available[0])?.keys() ?? [])].filter((day) =>
    available.every((id) => prices.get(id)!.has(day)),
  );
  const end = common.at(-1);
  const cutoff = end && years !== 'all' ? `${Number(end.slice(0, 4)) - years}${end.slice(4)}` : '';
  const dates = common.filter((day) => day >= cutoff);
  const data = dates.map((day) =>
    Object.fromEntries([
      ['date', day],
      ...available.map((id) => [
        id,
        prices.get(id)!.get(day)! /
          (available.length > 1 ? prices.get(id)!.get(dates[0])! / 100 : 1),
      ]),
    ]),
  );
  const points = dates.length
    ? (comparisonObservations
        .get(selected[0])
        ?.points.filter((p) => key(p.date) >= (dates[0] ?? cutoff))
        .filter((p) => !end || key(p.date) <= end)
        .map((p) => ({ date: p.date, close: p.value })) ?? [])
    : [];
  return { available, monthly, adjusted, missingFx, dates, data, points };
}
