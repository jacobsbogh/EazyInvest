import type { HistoryObservation } from './history-types.js';

export const SAVINGS_MONTHLY_LIMIT = 1_000_000;
export const SAVINGS_INITIAL_LIMIT = 100_000_000;

export type SavingsOptions = {
  monthlyContribution: number;
  initialInvestment?: number;
  startMonth?: string;
  endMonth?: string;
  /** UTC calendar date. Its month is still incomplete and is excluded. */
  asOf: string;
};

export type SavingsPoint = {
  date: string;
  month: string;
  contributed: number;
  value: number;
  gain: number;
};

export type SavingsSimulation = {
  startMonth: string;
  endMonth: string;
  deposits: number;
  monthlyContribution: number;
  initialInvestment: number;
  contributed: number;
  endingValue: number;
  gain: number;
  points: SavingsPoint[];
};

function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('History contains an invalid date.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('History contains an invalid date.');
  return value;
}

function monthIndex(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

/** Validate supplied observations before removing the current UTC month. No dates are filled in. */
export function completedSavingsObservations(
  observations: HistoryObservation[],
  asOf: string,
): HistoryObservation[] {
  calendarDate(asOf);
  let previousDate = '';
  let previousMonth = '';
  for (const point of observations) {
    calendarDate(point.date);
    if (!Number.isFinite(point.value) || point.value <= 0)
      throw new Error('History must contain positive, finite DKK values.');
    if (point.date > asOf) throw new Error('History contains a future observation.');
    if (point.date <= previousDate) throw new Error('History must be in ascending date order.');
    if (point.date.slice(0, 7) === previousMonth)
      throw new Error('History contains more than one observation for a month.');
    previousDate = point.date;
    previousMonth = point.date.slice(0, 7);
  }
  return observations.filter((point) => point.date.slice(0, 7) < asOf.slice(0, 7));
}

/**
 * Replay a fixed nominal-DKK contribution at every observed month close.
 * The initial amount and first contribution enter at the first close; later
 * observations grow the prior balance before adding that month's contribution.
 * Values are a DKK return series, not execution prices or an integer share ledger.
 */
export function simulateMonthlySavings(
  observations: HistoryObservation[],
  options: SavingsOptions,
): SavingsSimulation {
  const { monthlyContribution, initialInvestment = 0 } = options;
  if (
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0 ||
    monthlyContribution > SAVINGS_MONTHLY_LIMIT
  )
    throw new Error('Enter a monthly contribution between 0 and 1,000,000 DKK.');
  if (
    !Number.isFinite(initialInvestment) ||
    initialInvestment < 0 ||
    initialInvestment > SAVINGS_INITIAL_LIMIT
  )
    throw new Error('Enter an initial investment between 0 and 100,000,000 DKK.');
  if (monthlyContribution === 0 && initialInvestment === 0)
    throw new Error('Enter a monthly contribution or an initial investment greater than zero.');

  const completed = completedSavingsObservations(observations, options.asOf);
  if (!completed.length) throw new Error('No completed monthly DKK observations are available.');
  const startMonth = options.startMonth ?? completed[0].date.slice(0, 7);
  const endMonth = options.endMonth ?? completed.at(-1)!.date.slice(0, 7);
  if (monthIndex(startMonth) > monthIndex(endMonth))
    throw new Error('The start month must be on or before the end month.');
  const start = completed.findIndex((point) => point.date.slice(0, 7) === startMonth);
  const end = completed.findIndex((point) => point.date.slice(0, 7) === endMonth);
  if (start < 0 || end < 0) throw new Error('Choose months with completed DKK observations.');
  const selected = completed.slice(start, end + 1);
  for (let i = 1; i < selected.length; i++) {
    if (
      monthIndex(selected[i].date.slice(0, 7)) !==
      monthIndex(selected[i - 1].date.slice(0, 7)) + 1
    )
      throw new Error(
        'This period has a missing monthly observation or historical exchange rate. Choose a shorter period without gaps.',
      );
  }

  let value = initialInvestment;
  let contributed = initialInvestment;
  const points = selected.map((point, index) => {
    if (index > 0) value *= point.value / selected[index - 1].value;
    value += monthlyContribution;
    contributed += monthlyContribution;
    if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)
      throw new Error(
        'The historical values exceed the simulation limit. Choose smaller amounts or a shorter period.',
      );
    return {
      date: point.date,
      month: point.date.slice(0, 7),
      contributed,
      value,
      gain: value - contributed,
    };
  });
  return {
    startMonth,
    endMonth,
    deposits: monthlyContribution > 0 ? points.length : 0,
    monthlyContribution,
    initialInvestment,
    contributed,
    endingValue: value,
    gain: value - contributed,
    points,
  };
}
