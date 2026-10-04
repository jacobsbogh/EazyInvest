import { dateSchema, marketSchema, type MarketSeries } from '../../shared/schema.js';

export type FxRates = { date: string; EUR: number; USD: number; DKK: number };

export function parseEcbHistory(xml: string): FxRates[] {
  const today = new Date().toISOString().slice(0, 10);
  const observations = [...xml.matchAll(/<Cube\s+time=['"]([^'"]+)['"]\s*>([\s\S]*?)<\/Cube>/gu)]
    .map((day) => {
      const date = dateSchema.parse(day[1]);
      if (date > today) throw new Error('Future FX observation.');
      const entries = [
        ...day[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]+)['"]/gu),
      ];
      const rates = new Map(entries.map((match) => [match[1], Number(match[2])]));
      const dkk = rates.get('DKK');
      const usd = rates.get('USD');
      if (
        !dkk ||
        !usd ||
        !Number.isFinite(dkk) ||
        !Number.isFinite(usd) ||
        dkk <= 0 ||
        usd <= 0 ||
        rates.size !== entries.length
      )
        throw new Error('Missing or invalid ECB reference rates.');
      // The ECB quotes both currencies per EUR: DKK/USD = (DKK/EUR)/(USD/EUR).
      const usdToDkk = dkk / usd;
      if (!Number.isFinite(usdToDkk) || usdToDkk <= 0) throw new Error('Invalid ECB cross rate.');
      return { date, EUR: dkk, USD: usdToDkk, DKK: 1 };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (
    !observations.length ||
    new Set(observations.map((day) => day.date)).size !== observations.length
  )
    throw new Error('Missing or duplicate ECB observations.');
  return observations;
}

export function parseEcbRates(xml: string): FxRates {
  return parseEcbHistory(xml).at(-1)!;
}

// History is ascending, as returned by parseEcbHistory. Choose only a reference
// date at or before the actual exchange close, with a bounded holiday fallback.
export function historicalFxForDate(
  history: readonly FxRates[],
  date: string,
  currency: 'EUR' | 'USD' | 'DKK',
): { fxToDkk: number; fxDate: string } | undefined {
  dateSchema.parse(date);
  if (currency === 'DKK') return { fxToDkk: 1, fxDate: date };
  let lower = 0;
  let upper = history.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (history[middle].date <= date) lower = middle + 1;
    else upper = middle;
  }
  const observation = history[lower - 1];
  if (!observation || Date.parse(date) - Date.parse(observation.date) > 7 * 86400000)
    return undefined;
  return { fxToDkk: observation[currency], fxDate: observation.date };
}

export function withHistoricalFx(series: MarketSeries, history: readonly FxRates[]): MarketSeries {
  return marketSchema.parse({
    ...series,
    points: series.points.map(({ fxToDkk: _rate, fxDate: _date, ...point }) => ({
      ...point,
      ...historicalFxForDate(history, point.date, series.currency),
    })),
  });
}

export async function fetchEcbRates() {
  const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('ECB reference rates are unavailable.');
  return parseEcbRates(await response.text());
}

export async function fetchEcbHistory(): Promise<FxRates[]> {
  const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml', {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('ECB historical reference rates are unavailable.');
  return parseEcbHistory(await response.text());
}
