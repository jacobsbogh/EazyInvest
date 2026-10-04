import type { MarketSeries } from './schema.js';
import { marketSchema } from './schema.js';
import { strategySchema, type Strategy, monthSchema } from './strategy.js';
import { historicalObservations } from './historical-series.js';
import { completedSavingsObservations } from './savings-simulation.js';
import type { HistoryObservation } from './history-types.js';

type Monthly = { month: string; date: string; values: Record<string, number> };
export type StrategyHistory = { months: Monthly[]; ids: string[]; demo: boolean };
export type StrategyPoint = {
  date: string;
  month: string;
  value: number;
  contributed: number;
  gain: number;
  index: number;
};
export type StrategyResult = {
  points: StrategyPoint[];
  contributed: number;
  value: number;
  gain: number;
  drawdown: number;
  peakMonth: string | null;
  troughMonth: string | null;
  recoveryMonth: string | null;
  recoveryMonths: number | null;
  worstMonth: number;
};
const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

/** Match completed calendar months; different venues can close on different days. */
export function commonStrategyHistory(
  strategies: Strategy[],
  market: Partial<Record<string, MarketSeries>>,
  {
    asOf = new Date().toISOString().slice(0, 10),
    demo = false,
  }: { asOf?: string; demo?: boolean } = {},
): StrategyHistory {
  if (!strategies.length) throw new Error('Choose a strategy to analyze.');
  const ids = [
    ...new Set(
      strategies.flatMap((s) => strategySchema.parse(s).allocations.map((a) => a.instrumentId)),
    ),
  ];
  const series = ids.map((id) => {
    const cached = market[id];
    if (!cached) throw new Error(`History is not ready for ${id}. Request its history in Explore.`);
    const parsed = marketSchema.parse(cached);
    if (parsed.instrumentId !== id || (parsed.source === 'demo') !== demo)
      throw new Error('The history does not match this workspace.');
    const history = historicalObservations(parsed, 'DKK');
    if (history.missingFx) throw new Error(`Dated DKK exchange rates are missing for ${id}.`);
    if (!demo && !history.adjusted)
      throw new Error(`Adjusted return history is missing for ${id}.`);
    const points = completedSavingsObservations(history.points, asOf);
    if (!points.length) throw new Error(`No completed monthly history is available for ${id}.`);
    return new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
  });
  const months = [...series[0].keys()]
    .filter((month) => series.every((s) => s.has(month)))
    .map((month) => ({
      month,
      date: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10),
      values: Object.fromEntries(ids.map((id, i) => [id, series[i].get(month)!])),
    }));
  if (months.length < 2)
    throw new Error('These investments need at least two common completed months.');
  return { months, ids, demo };
}

/** Contributions enter at month close; annual rebalancing follows December's deposit. */
export function backtestStrategy(
  input: Strategy,
  history: StrategyHistory,
  options: { initial?: number; monthly?: number; startMonth?: string; endMonth?: string } = {},
): StrategyResult {
  const strategy = strategySchema.parse({
    ...input,
    initial: options.initial ?? input.initial,
    monthly: options.monthly ?? input.monthly,
  });
  const startMonth = monthSchema.parse(
    options.startMonth ?? strategy.startMonth ?? history.months[0]?.month,
  );
  const endMonth = monthSchema.parse(
    options.endMonth ?? strategy.endMonth ?? history.months.at(-1)?.month,
  );
  const selected = history.months.filter((p) => p.month >= startMonth && p.month <= endMonth);
  if (
    selected.length < 2 ||
    selected[0].month !== startMonth ||
    selected.at(-1)!.month !== endMonth
  )
    throw new Error('Choose at least two completed months inside the common history.');
  for (let i = 0; i < selected.length; i++) {
    if (i > 0 && monthNumber(selected[i].month) !== monthNumber(selected[i - 1].month) + 1)
      throw new Error(
        'This period has a missing monthly observation. Choose a shorter period without gaps.',
      );
    for (const a of strategy.allocations)
      if (
        !Number.isFinite(selected[i].values[a.instrumentId]) ||
        selected[i].values[a.instrumentId] <= 0
      )
        throw new Error('The history is missing a positive DKK observation.');
  }
  let balances = strategy.allocations.map((a) => (strategy.initial * a.weight) / 100);
  let contributed = strategy.initial;
  let index = 100;
  let peak = 100;
  let peakMonth = selected[0].month;
  let drawdown = 0;
  let deepestPeak: string | null = null;
  let trough: string | null = null;
  let recovery: string | null = null;
  let deepestPeakIndex = 100;
  let worstMonth = Number.POSITIVE_INFINITY;
  const points = selected.map((p, i) => {
    if (i > 0) {
      const before = balances.reduce((sum, b) => sum + b, 0);
      balances = balances.map(
        (b, j) =>
          (b * p.values[strategy.allocations[j].instrumentId]) /
          selected[i - 1].values[strategy.allocations[j].instrumentId],
      );
      const change = balances.reduce((sum, b) => sum + b, 0) / before - 1;
      index *= 1 + change;
      worstMonth = Math.min(worstMonth, change);
      const fall = index / peak - 1;
      if (fall < drawdown) {
        drawdown = fall;
        deepestPeak = peakMonth;
        deepestPeakIndex = peak;
        trough = p.month;
        recovery = null;
      }
      if (trough && recovery === null && index >= deepestPeakIndex - 1e-8) recovery = p.month;
      if (index >= peak) {
        peak = index;
        peakMonth = p.month;
      }
    }
    contributed += strategy.monthly;
    balances = balances.map(
      (b, j) => b + (strategy.monthly * strategy.allocations[j].weight) / 100,
    );
    const value = balances.reduce((sum, b) => sum + b, 0);
    if (
      ![value, contributed, index].every(
        (n) => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER,
      )
    )
      throw new Error('These amounts exceed the historical simulation limit.');
    if (strategy.rebalance === 'annual' && p.month.endsWith('-12'))
      balances = strategy.allocations.map((a) => (value * a.weight) / 100);
    return { date: p.date, month: p.month, value, contributed, gain: value - contributed, index };
  });
  const last = points.at(-1)!;
  return {
    points,
    contributed: last.contributed,
    value: last.value,
    gain: last.gain,
    drawdown,
    peakMonth: deepestPeak,
    troughMonth: trough,
    recoveryMonth: recovery,
    recoveryMonths:
      recovery && deepestPeak ? monthNumber(recovery) - monthNumber(deepestPeak) : null,
    worstMonth,
  };
}
export const strategyReturnObservations = (result: StrategyResult): HistoryObservation[] =>
  result.points.map((p) => ({ date: p.date, value: p.index }));
