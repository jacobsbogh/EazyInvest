import type { InstrumentId, MarketSeries } from './schema.js';

export function latestQuote(series: MarketSeries | undefined) {
  return series?.quote ?? series?.points.at(-1);
}

// Compare month-end observations by month when every series is monthly. Exchanges
// can have different last trading days. Never interpolate or extend a fund's history.
export function historicalComparison(
  market: Partial<Record<InstrumentId, MarketSeries>>,
  selected: InstrumentId[],
  years: number | 'all',
) {
  const available = selected.filter((id) => market[id]);
  const monthly =
    available.length > 0 && available.every((id) => market[id]!.frequency === 'monthly');
  const adjusted =
    available.length > 0 &&
    available.every((id) => market[id]!.adjustment === 'splits-and-dividends');
  const key = (day: string) => (monthly ? day.slice(0, 7) : day);
  const prices = new Map(
    available.map((id) => [
      id,
      new Map(market[id]!.points.map((p) => [key(p.date), adjusted ? p.adjustedClose! : p.close])),
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
    ? (market[selected[0]]?.points
        .filter((p) => key(p.date) >= (dates[0] ?? cutoff))
        .filter((p) => !end || key(p.date) <= end)
        .map((p) => ({ date: p.date, close: adjusted ? p.adjustedClose! : p.close })) ?? [])
    : [];
  return { available, monthly, adjusted, dates, data, points };
}
