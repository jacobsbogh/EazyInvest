import type { HistoryObservation } from './history-types.js';
import type { MarketSeries } from './schema.js';
import { ecbHistoryStart } from './market-policy.js';

export function historicalObservations(
  series: MarketSeries | undefined,
  currency: 'native' | 'DKK',
): {
  points: HistoryObservation[];
  currency: 'EUR' | 'USD' | 'DKK';
  adjusted: boolean;
  missingFx: boolean;
} {
  const adjusted =
    series?.adjustment === 'splits-and-dividends' &&
    series.points.every((point) => point.adjustedClose !== undefined);
  const resultCurrency = currency === 'DKK' ? 'DKK' : (series?.currency ?? 'DKK');
  if (!series) return { points: [], currency: resultCurrency, adjusted: false, missingFx: false };
  const convert = currency === 'DKK' && series.currency !== 'DKK';
  // Preserve full native history. ECB conversion starts with its first published
  // euro rates; any missing rate inside that supported period still fails closed.
  const observations =
    convert && series.fxSource === 'ECB'
      ? series.points.filter((point) => point.date >= ecbHistoryStart)
      : series.points;
  const missingFx =
    convert &&
    observations.some((point) => {
      if (
        point.fxToDkk === undefined ||
        !Number.isFinite(point.fxToDkk) ||
        point.fxToDkk <= 0 ||
        !point.fxDate
      )
        return true;
      const age = Date.parse(point.date) - Date.parse(point.fxDate);
      return !Number.isFinite(age) || age < 0 || age > 7 * 86400000;
    });
  // Incomplete FX cannot bridge gaps or silently use today's rate. Downstream
  // returns and savings calculations need every observed close in one currency.
  const points = missingFx
    ? []
    : observations.map((point) => ({
        date: point.date,
        value: (adjusted ? point.adjustedClose! : point.close) * (convert ? point.fxToDkk! : 1),
      }));
  return { points, currency: resultCurrency, adjusted, missingFx };
}
