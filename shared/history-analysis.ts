import type { HistoryObservation } from './history-types.js';

export const HOLDING_PERIOD_YEARS = [5, 10, 20] as const;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

export type HistoryReturnPeriod = {
  startDate: string;
  endDate: string;
  elapsedDays: number;
  totalReturn: number | null;
  annualizedReturn: number | null;
};

export type CalendarYearReturn = {
  year: number;
  kind: 'full-year' | 'ytd' | 'partial-year';
  startDate: string;
  endDate: string;
  totalReturn: number | null;
};

export type RollingHoldingPeriod = {
  years: (typeof HOLDING_PERIOD_YEARS)[number];
  months: number;
  sampleCount: number;
  lossCount: number;
  lossShare: number | null;
  best: HistoryReturnPeriod | null;
  worst: HistoryReturnPeriod | null;
};

export type HistoryAnalysis = {
  status: 'available' | 'insufficient-history' | 'invalid-history';
  issue: string | null;
  observationCount: number;
  completedMonthCount: number;
  headline: HistoryReturnPeriod | null;
  yearly: CalendarYearReturn[];
  rolling: RollingHoldingPeriod[];
};

type ObservedDate = {
  timestamp: number;
  year: number;
  month: number;
  day: number;
  monthIndex: number;
};
type DatedObservation = HistoryObservation & ObservedDate;

function observedDate(value: unknown): ObservedDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7)) - 1;
  return {
    timestamp,
    year,
    month,
    day: Number(value.slice(8, 10)),
    monthIndex: year * 12 + month,
  };
}

function emptyRolling(): RollingHoldingPeriod[] {
  return HOLDING_PERIOD_YEARS.map((years) => ({
    years,
    months: years * 12,
    sampleCount: 0,
    lossCount: 0,
    lossShare: null,
    best: null,
    worst: null,
  }));
}

function emptyAnalysis(
  status: HistoryAnalysis['status'],
  issue: string,
  observationCount = 0,
): HistoryAnalysis {
  return {
    status,
    issue,
    observationCount,
    completedMonthCount: 0,
    headline: null,
    yearly: [],
    rolling: emptyRolling(),
  };
}

function finiteReturn(start: number, end: number): number | null {
  const change = end / start - 1;
  return Number.isFinite(change) ? change : null;
}

// A calendar anniversary sets the minimum period for annualization. The rate itself
// uses ACT/365.25: elapsed UTC days divided by 365.25, including leap days.
function calendarAnniversary(start: DatedObservation): number {
  const lastDay = new Date(start.timestamp);
  lastDay.setUTCFullYear(start.year + 1, start.month + 1, 0);
  const anniversary = new Date(start.timestamp);
  anniversary.setUTCFullYear(
    start.year + 1,
    start.month,
    Math.min(start.day, lastDay.getUTCDate()),
  );
  return anniversary.getTime();
}

function returnPeriod(start: DatedObservation, end: DatedObservation): HistoryReturnPeriod {
  const elapsedDays = (end.timestamp - start.timestamp) / MILLISECONDS_PER_DAY;
  const annualized =
    end.timestamp >= calendarAnniversary(start)
      ? Math.expm1((Math.log(end.value) - Math.log(start.value)) / (elapsedDays / DAYS_PER_YEAR))
      : null;
  return {
    startDate: start.date,
    endDate: end.date,
    elapsedDays,
    totalReturn: elapsedDays > 0 ? finiteReturn(start.value, end.value) : null,
    annualizedReturn: annualized !== null && Number.isFinite(annualized) ? annualized : null,
  };
}

function calendarYears(points: DatedObservation[], asOf: ObservedDate): CalendarYearReturn[] {
  const years = new Map<number, { first: DatedObservation; last: DatedObservation }>();
  for (const point of points) {
    const year = years.get(point.year);
    if (year) year.last = point;
    else years.set(point.year, { first: point, last: point });
  }
  const results: CalendarYearReturn[] = [];
  for (const [year, observations] of years) {
    const previous = years.get(year - 1)?.last;
    const yearStart = previous?.month === 11 ? previous : null;
    const start = yearStart ?? observations.first;
    const end = observations.last;
    const completeDecember = end.month === 11 && end.monthIndex < asOf.monthIndex;
    const kind =
      yearStart && completeDecember
        ? 'full-year'
        : yearStart && year === asOf.year
          ? 'ytd'
          : 'partial-year';
    results.push({
      year,
      kind,
      startDate: start.date,
      endDate: end.date,
      totalReturn: start.timestamp < end.timestamp ? finiteReturn(start.value, end.value) : null,
    });
  }
  return results;
}

function rollingPeriods(completedMonths: DatedObservation[]): RollingHoldingPeriod[] {
  const results = emptyRolling();
  let contiguousCount = 0;
  for (let endIndex = 0; endIndex < completedMonths.length; endIndex++) {
    const end = completedMonths[endIndex];
    const previous = completedMonths[endIndex - 1];
    contiguousCount =
      previous && end.monthIndex === previous.monthIndex + 1 ? contiguousCount + 1 : 1;
    for (const result of results) {
      // N years requires N*12 month differences, i.e. N*12+1 observed month ends.
      if (contiguousCount < result.months + 1) continue;
      const start = completedMonths[endIndex - result.months];
      const period = returnPeriod(start, end);
      if (period.totalReturn === null || period.annualizedReturn === null) continue;
      result.sampleCount++;
      if (period.totalReturn < 0) result.lossCount++;
      if (!result.best || period.annualizedReturn > result.best.annualizedReturn!)
        result.best = period;
      if (!result.worst || period.annualizedReturn < result.worst.annualizedReturn!)
        result.worst = period;
    }
  }
  for (const result of results)
    result.lossShare = result.sampleCount ? result.lossCount / result.sampleCount : null;
  return results;
}

/**
 * Analyze one observed return series, already expressed in its analysis currency.
 * Dates must be strictly ascending and values positive and finite. No sorting,
 * interpolation, backfilling, or extrapolation is performed.
 *
 * If multiple dated observations exist in a month, its last observation is used
 * as the monthly endpoint. Rolling periods require every consecutive completed
 * month and exclude the current partial month, as identified by `asOf` (UTC date).
 */
export function analyzeHistory(
  points: readonly HistoryObservation[],
  { asOf = new Date().toISOString().slice(0, 10) }: { asOf?: string } = {},
): HistoryAnalysis {
  const cutoff = observedDate(asOf);
  if (!cutoff) return emptyAnalysis('invalid-history', 'The analysis date is invalid.');
  if (!Array.isArray(points))
    return emptyAnalysis('invalid-history', 'Historical observations are missing or malformed.');
  const observed: DatedObservation[] = [];
  for (const point of points) {
    if (!point || typeof point !== 'object')
      return emptyAnalysis('invalid-history', 'Historical observations are missing or malformed.');
    const parsed = observedDate(point.date);
    if (!parsed || !Number.isFinite(point.value) || point.value <= 0)
      return emptyAnalysis(
        'invalid-history',
        'Historical dates and values must be valid and positive.',
      );
    if (parsed.timestamp > cutoff.timestamp)
      return emptyAnalysis('invalid-history', 'Historical observations cannot be in the future.');
    if (observed.length && point.date <= observed[observed.length - 1].date)
      return emptyAnalysis(
        'invalid-history',
        'Historical dates must be unique and in ascending order.',
      );
    observed.push({ date: point.date, value: point.value, ...parsed });
  }
  if (observed.length < 2)
    return emptyAnalysis(
      'insufficient-history',
      'At least two dated observations are needed to measure a return.',
      observed.length,
    );
  const months: DatedObservation[] = [];
  for (const point of observed) {
    if (months.at(-1)?.monthIndex === point.monthIndex) months[months.length - 1] = point;
    else months.push(point);
  }
  const completedMonths = months.filter((point) => point.monthIndex < cutoff.monthIndex);
  return {
    status: 'available',
    issue: null,
    observationCount: observed.length,
    completedMonthCount: completedMonths.length,
    headline: returnPeriod(observed[0], observed[observed.length - 1]),
    yearly: calendarYears(observed, cutoff),
    rolling: rollingPeriods(completedMonths),
  };
}
