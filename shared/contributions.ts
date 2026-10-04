import { z } from 'zod';
import type { Instrument } from './instrument.js';
import { quoteMatchesListing, quoteIsStale, quoteSchema, type MarketQuote } from './quote.js';
export function contributionQuote(
  quote: MarketQuote | undefined,
  item: Instrument,
  demo = false,
  now = Date.now(),
) {
  if (
    !quote ||
    !quoteSchema.safeParse(quote).success ||
    quote.instrumentId !== item.id ||
    quote.currency !== item.currency
  )
    return { issue: 'Quote unavailable for this listing.' };
  if (demo && quote.source === 'demo')
    return { quote, priceDkk: quote.quote.close * quote.fxToDkk };
  if (quote.source === 'demo' || !quoteMatchesListing(quote, item))
    return { issue: 'Quote listing identity is unverified.' };
  if (
    Date.parse(quote.fetchedAt) > now ||
    Date.parse(quote.quote.date) > now ||
    quoteIsStale(quote, now)
  )
    return { issue: 'Quote is stale or dated in the future. Refresh saved data before planning.' };
  return { quote, priceDkk: quote.quote.close * quote.fxToDkk };
}
const cashAmount = (maximum: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(maximum)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      'Enter cash amounts with at most two decimal places.',
    );
export const contributionSchema = z
  .object({
    monthly: cashAmount(1000000),
    cash: cashAmount(100000000),
    months: z.number().int().min(1).max(12),
    units: z.enum(['whole', 'fractional']),
    allocation: z.enum(['target', 'gaps']),
    feePercent: z.number().finite().min(0).max(5),
    minimumFee: cashAmount(10000),
    fxPercent: z.number().finite().min(0).max(5),
  })
  .strict();
export type ContributionSettings = z.infer<typeof contributionSchema>;
export type ContributionInput = {
  id: string;
  weight: number;
  heldUnits: number;
  currency: 'DKK' | 'EUR' | 'USD';
  priceDkk?: number;
};
export type ContributionOrder = {
  id: string;
  budget: number;
  quantity: number;
  notional: number;
  commission: number;
  fxCost: number;
  spent: number;
  heldValue: number | null;
  afterWeight: number | null;
  available: boolean;
};
export type ContributionMonth = {
  month: number;
  openingCash: number;
  contribution: number;
  available: number;
  spent: number;
  fees: number;
  closingCash: number;
  orders: ContributionOrder[];
  issue: string | null;
};
const ceilCents = (n: number) => Math.ceil(n * 100 - 1e-7);
const cents = (n: number) => Math.round(n * 100);
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum),
    allocated = exact.map(Math.floor);
  const order = exact
    .map((n, i) => ({ i, remainder: n - allocated[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  let remaining = total - allocated.reduce((a, b) => a + b, 0);
  for (const r of order) {
    if (remaining-- <= 0) break;
    allocated[r.i]++;
  }
  return allocated;
}

/** No-sale order worksheet. Prices remain fixed throughout an optional rehearsal. */
export function contributionPlan(
  input: ContributionInput[],
  settings: ContributionSettings,
): ContributionMonth[] {
  const s = contributionSchema.parse(settings);
  if (
    !input.length ||
    input.length > 5 ||
    new Set(input.map((i) => i.id)).size !== input.length ||
    input.some(
      (i) =>
        !['DKK', 'EUR', 'USD'].includes(i.currency) ||
        !Number.isFinite(i.weight) ||
        i.weight <= 0 ||
        i.weight > 100 ||
        !Number.isFinite(i.heldUnits) ||
        i.heldUnits < 0 ||
        i.heldUnits > 10000000 ||
        (i.priceDkk !== undefined &&
          (!Number.isFinite(i.priceDkk) || i.priceDkk <= 0 || i.priceDkk > 1000000000)),
    ) ||
    Math.abs(input.reduce((sum, i) => sum + i.weight, 0) - 100) > 0.000001
  )
    throw new Error('Check contribution allocations, units and prices.');
  const held = input.map((i) => i.heldUnits);
  let cash = cents(s.cash);
  const result: ContributionMonth[] = [];
  const scale = s.units === 'whole' ? 1 : 1000000;
  for (let month = 1; month <= s.months; month++) {
    const openingCash = cash,
      available = cash + cents(s.monthly);
    const values = input.map((i, n) =>
      held[n] === 0 ? 0 : i.priceDkk === undefined ? null : held[n] * i.priceDkk,
    );
    const valued = values.every((v) => v !== null);
    const issue =
      s.allocation === 'gaps' && !valued
        ? 'Underweight planning needs valid prices for all recorded strategy holdings.'
        : null;
    const current = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
    const gaps = input.map((i, n) =>
      Math.max(0, ((current + available / 100) * i.weight) / 100 - (values[n] ?? 0)),
    );
    const budgets = issue
      ? input.map(() => 0)
      : apportion(available, s.allocation === 'target' ? input.map((i) => i.weight) : gaps);
    let spent = 0,
      fees = 0;
    const orders = input.map((i, n): ContributionOrder => {
      const budget = budgets[n];
      const price = i.priceDkk;
      function costs(steps: number) {
        if (!steps || price === undefined)
          return { notional: 0, commission: 0, fxCost: 0, total: 0 };
        const notional = ceilCents((steps / scale) * price);
        const commission = Math.max(
          cents(s.minimumFee),
          ceilCents(((notional / 100) * s.feePercent) / 100),
        );
        const fxCost = i.currency === 'DKK' ? 0 : ceilCents(((notional / 100) * s.fxPercent) / 100);
        return { notional, commission, fxCost, total: notional + commission + fxCost };
      }
      let low = 0,
        high =
          price === undefined
            ? 0
            : Math.min(10000000 * scale, Math.floor((budget / 100 / price) * scale));
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (costs(middle).total <= budget) low = middle;
        else high = middle - 1;
      }
      const cost = costs(low),
        quantity = low / scale;
      held[n] += quantity;
      spent += cost.total;
      fees += cost.commission + cost.fxCost;
      return {
        id: i.id,
        budget: budget / 100,
        quantity,
        notional: cost.notional / 100,
        commission: cost.commission / 100,
        fxCost: cost.fxCost / 100,
        spent: cost.total / 100,
        heldValue: held[n] === 0 ? 0 : price === undefined ? null : held[n] * price,
        afterWeight: null,
        available: price !== undefined,
      };
    });
    const after = orders.reduce((sum, o) => sum + (o.heldValue ?? 0), 0);
    if (orders.every((o) => o.heldValue !== null) && after > 0)
      for (const o of orders) o.afterWeight = ((o.heldValue ?? 0) / after) * 100;
    cash = available - spent;
    if (cash < 0 || !Number.isSafeInteger(cash))
      throw new Error('Contribution plan exceeds its cash budget.');
    result.push({
      month,
      openingCash: openingCash / 100,
      contribution: cents(s.monthly) / 100,
      available: available / 100,
      spent: spent / 100,
      fees: fees / 100,
      closingCash: cash / 100,
      orders,
      issue,
    });
  }
  return result;
}
