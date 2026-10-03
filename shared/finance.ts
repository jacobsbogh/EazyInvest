import type { Plan, Transaction, InstrumentId, MarketSeries } from './schema.js';
import { equityTax, tax2026 } from './tax.js';

export type ProjectionPoint = {
  year: number;
  contributed: number;
  value: number;
  beforeExitTax: number;
  tax: number;
  cash: number;
};
// Contributions at month end; growth and costs compound monthly. Annual taxes are paid from the account.
export function project(
  plan: Plan,
  returnRate = plan.returnRate,
  crashYear?: number,
): ProjectionPoint[] {
  let balance = plan.account === 'ask' ? Math.min(plan.initial, tax2026.askLimit) : plan.initial;
  let cash = plan.initial - balance;
  let contributed = balance;
  let losses = 0;
  let totalTax = 0;
  const result: ProjectionPoint[] = [
    { year: 0, contributed, value: balance, beforeExitTax: balance, tax: 0, cash },
  ];
  const monthlyGrowth = ((1 + returnRate / 100) * (1 - plan.fee / 100)) ** (1 / 12);
  for (let year = 1; year <= plan.years; year++) {
    const opening = balance;
    let deposits = 0;
    const annualRoom = plan.account === 'ask' ? Math.max(0, tax2026.askLimit - opening) : Infinity;
    for (let month = 0; month < 12; month++) {
      balance *= monthlyGrowth;
      if (crashYear === year && month === 0) balance *= 0.65;
      const deposit = Math.min(plan.monthly, Math.max(0, annualRoom - deposits));
      balance += deposit;
      deposits += deposit;
      cash += plan.monthly - deposit;
    }
    contributed += deposits;
    if (plan.account === 'ask' || plan.account === 'annual') {
      const gain = balance - opening - deposits;
      let taxable = 0;
      if (gain < 0) losses += -gain;
      else {
        taxable = Math.max(0, gain - losses);
        losses = Math.max(0, losses - gain);
      }
      const tax =
        plan.account === 'ask' ? taxable * tax2026.askRate : equityTax(taxable, plan.married);
      balance -= tax;
      totalTax += tax;
    }
    const exitTax = plan.account === 'general' ? equityTax(balance - contributed, plan.married) : 0;
    const deflator = plan.realTerms ? (1 + plan.inflation / 100) ** year : 1;
    result.push({
      year,
      contributed: contributed / deflator,
      value: (balance - exitTax) / deflator,
      beforeExitTax: balance / deflator,
      tax: (totalTax + exitTax) / deflator,
      cash: cash / deflator,
    });
  }
  return result;
}
export function scenarios(plan: Plan, crash = false) {
  const low = project(plan, Math.max(-30, plan.returnRate - 4), crash ? 2 : undefined);
  const middle = project(plan, plan.returnRate, crash ? 2 : undefined);
  const high = project(plan, plan.returnRate + 4, crash ? 2 : undefined);
  return middle.map((point, i) => ({ ...point, low: low[i].value, high: high[i].value }));
}
export function maxDrawdown(points: { close: number }[]): number {
  let peak = 0;
  let worst = 0;
  for (const { close } of points) {
    peak = Math.max(peak, close);
    if (peak) worst = Math.min(worst, close / peak - 1);
  }
  return worst;
}
export type Position = {
  id: InstrumentId;
  units: number;
  cost: number;
  realized: number;
  dividends: number;
  value: number | null;
  quoteDate: string | null;
};
export function portfolio(
  transactions: Transaction[],
  market: Partial<Record<InstrumentId, MarketSeries>>,
) {
  const positions = new Map<InstrumentId, Position>();
  let netInvested = 0;
  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = positions.get(tx.instrumentId) ?? {
      id: tx.instrumentId,
      units: 0,
      cost: 0,
      realized: 0,
      dividends: 0,
      value: null,
      quoteDate: null,
    };
    const gross = tx.quantity * tx.price * tx.fx;
    if (tx.type === 'buy') {
      p.units += tx.quantity;
      p.cost += gross + tx.fees;
      netInvested += gross + tx.fees;
    }
    if (tx.type === 'sell') {
      const basis = p.units > 0 ? (p.cost * tx.quantity) / p.units : 0;
      p.units = Math.max(0, p.units - tx.quantity);
      p.cost = Math.max(0, p.cost - basis);
      p.realized += gross - tx.fees - basis;
      netInvested -= gross - tx.fees;
    }
    if (tx.type === 'dividend') {
      p.dividends += gross - tx.fees;
      netInvested -= gross - tx.fees;
    }
    positions.set(tx.instrumentId, p);
  }
  for (const p of positions.values()) {
    const quote = market[p.id];
    if (p.units < 1e-8) p.value = 0;
    else if (quote) {
      p.value = p.units * quote.points.at(-1)!.close * quote.fxToDkk;
      p.quoteDate = quote.points.at(-1)!.date;
    }
  }
  const rows = [...positions.values()];
  const missing = rows.some((p) => p.value === null);
  const value = missing ? null : rows.reduce((sum, p) => sum + (p.value ?? 0), 0);
  return {
    rows,
    value,
    netInvested,
    profit: value === null ? null : value - netInvested,
    cost: rows.reduce((sum, p) => sum + p.cost, 0),
    realized: rows.reduce((sum, p) => sum + p.realized, 0),
    dividends: rows.reduce((sum, p) => sum + p.dividends, 0),
  };
}
