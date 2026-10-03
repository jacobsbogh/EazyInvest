import { z } from 'zod';

export const instrumentIds = ['vwce', 'eunl', 'is3n', 'sxr8', 'novo', 'msft'] as const;
export const instrumentIdSchema = z.enum(instrumentIds);
const money = z.number().finite().min(0).max(100_000_000);
export const planSchema = z.object({
  initial: money,
  monthly: money.max(1_000_000),
  years: z.number().int().min(1).max(40),
  returnRate: z.number().finite().min(-10).max(20),
  fee: z.number().finite().min(0).max(5),
  inflation: z.number().finite().min(0).max(15),
  goal: money.min(1),
  account: z.enum(['general', 'ask', 'annual', 'none']),
  realTerms: z.boolean(),
  married: z.boolean(),
});
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date');
export const transactionSchema = z
  .object({
    id: z.string().min(1).max(80),
    instrumentId: instrumentIdSchema,
    type: z.enum(['buy', 'sell', 'dividend']),
    date: dateSchema,
    quantity: z.number().finite().positive().max(10_000_000),
    price: z.number().finite().positive().max(10_000_000),
    fx: z.number().finite().positive().max(100_000),
    fees: money,
    note: z.string().max(500),
  })
  .strict();
export const watchSchema = z
  .object({ instrumentId: instrumentIdSchema, note: z.string().max(2000) })
  .strict();
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(60),
    plan: planSchema,
    transactions: z.array(transactionSchema).max(500),
    watchlist: z.array(watchSchema).max(6),
    completedLessons: z
      .array(
        z.enum(['starting', 'compounding', 'diversification', 'costs', 'danish-tax', 'behavior']),
      )
      .max(6),
  })
  .strict();
export const storedSchema = z.object({
  revision: z.number().int().nonnegative(),
  data: workspaceSchema,
});
const marketPointSchema = z.object({
  date: dateSchema,
  close: z.number().finite().positive(),
  adjustedClose: z.number().finite().positive().optional(),
});
export const marketSchema = z
  .object({
    instrumentId: instrumentIdSchema,
    currency: z.enum(['EUR', 'USD', 'DKK']),
    source: z.enum(['demo', 'Twelve Data', 'Alpha Vantage']),
    fetchedAt: z.string().datetime(),
    fxToDkk: z.number().finite().positive(),
    fxDate: dateSchema,
    points: z.array(marketPointSchema).min(1).max(6000),
    frequency: z.literal('monthly').optional(),
    adjustment: z.literal('splits-and-dividends').optional(),
    providerSymbol: z.string().min(1).max(40).optional(),
    quote: z.object({ date: dateSchema, close: z.number().finite().positive() }).optional(),
    fxSource: z.literal('ECB').optional(),
  })
  .superRefine((series, context) => {
    if (series.points.some((point, i) => i > 0 && point.date <= series.points[i - 1].date))
      context.addIssue({ code: 'custom', message: 'Market dates must be unique and ascending.' });
    if (
      series.source === 'Alpha Vantage' &&
      (!series.providerSymbol ||
        series.frequency !== 'monthly' ||
        series.adjustment !== 'splits-and-dividends' ||
        series.fxSource !== 'ECB' ||
        !series.quote ||
        series.points.some((point) => point.adjustedClose === undefined) ||
        new Set(series.points.map((point) => point.date.slice(0, 7))).size !==
          series.points.length ||
        (series.quote && series.quote.date < series.points.at(-1)!.date))
    )
      context.addIssue({
        code: 'custom',
        message: 'Adjusted monthly data requires provenance and a separate current quote.',
      });
  });
export type Plan = z.infer<typeof planSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type StoredWorkspace = z.infer<typeof storedSchema>;
export type InstrumentId = z.infer<typeof instrumentIdSchema>;
export type MarketSeries = z.infer<typeof marketSchema>;

export function validateLedger(transactions: Transaction[]): string | null {
  const held = new Map<string, number>();
  const ids = new Set<string>();
  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (ids.has(tx.id)) return 'Transaction IDs must be unique.';
    ids.add(tx.id);
    if (tx.date > new Date().toISOString().slice(0, 10))
      return 'Transactions cannot be in the future.';
    const quantity = held.get(tx.instrumentId) ?? 0;
    if (tx.type === 'sell' && tx.quantity > quantity + 1e-8)
      return `A sale on ${tx.date} exceeds the units held. Add its purchase first.`;
    held.set(
      tx.instrumentId,
      quantity + (tx.type === 'buy' ? tx.quantity : tx.type === 'sell' ? -tx.quantity : 0),
    );
  }
  return null;
}
export function parseWorkspace(input: unknown): Workspace {
  const result = workspaceSchema.parse(input);
  const error = validateLedger(result.transactions);
  if (error) throw new Error(error);
  if (new Set(result.watchlist.map((w) => w.instrumentId)).size !== result.watchlist.length)
    throw new Error('Watchlist contains duplicates.');
  if (new Set(result.completedLessons).size !== result.completedLessons.length)
    throw new Error('Completed lessons contain duplicates.');
  return result;
}
