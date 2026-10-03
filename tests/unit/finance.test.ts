import { describe, expect, it } from 'vitest';
import { project, portfolio, maxDrawdown } from '../../shared/finance';
import { equityTax, askRoom, tax2026 } from '../../shared/tax';
import { emptyWorkspace, demoMarket } from '../../src/lib/demo';
import type { Transaction } from '../../shared/schema';
const plan = {
  ...emptyWorkspace().plan,
  account: 'none' as const,
  fee: 0,
  returnRate: 0,
  years: 1,
  initial: 10000,
  monthly: 1000,
};
describe('projection calculations', () => {
  it('separates contributions from returns with zero growth', () => {
    const end = project(plan).at(-1)!;
    expect(end.value).toBeCloseTo(22000);
    expect(end.contributed).toBe(22000);
    expect(end.tax).toBe(0);
  });
  it('compounds an annual effective rate correctly', () => {
    const end = project({ ...plan, monthly: 0, returnRate: 10, years: 2 }).at(-1)!;
    expect(end.value).toBeCloseTo(12100);
  });
  it('applies contributions at the end of the month', () => {
    const r = 1.12 ** (1 / 12);
    const end = project({ ...plan, initial: 0, returnRate: 12 }).at(-1)!;
    expect(end.value).toBeCloseTo((1000 * (r ** 12 - 1)) / (r - 1));
  });
  it('deducts ongoing fees as a multiplicative annual factor', () => {
    expect(project({ ...plan, monthly: 0, returnRate: 10, fee: 1 }).at(-1)!.value).toBeCloseTo(
      10890,
    );
  });
  it('deflates all final values consistently', () => {
    const nominal = project({ ...plan, returnRate: 8 }).at(-1)!;
    const real = project({ ...plan, returnRate: 8, realTerms: true, inflation: 2 }).at(-1)!;
    expect(real.value).toBeCloseTo(nominal.value / 1.02);
    expect(real.contributed).toBeCloseTo(22000 / 1.02);
  });
  it('computes progressive exit tax without taxing contributed capital', () => {
    const end = project({
      ...plan,
      initial: 1000000,
      monthly: 0,
      returnRate: 10,
      account: 'general',
    }).at(-1)!;
    expect(end.tax).toBeCloseTo(79400 * 0.27 + 20600 * 0.42);
    expect(end.value).toBeCloseTo(1100000 - end.tax);
  });
  it('keeps ASK excess contributions in separate cash', () => {
    const end = project({ ...plan, initial: 170000, monthly: 1000, account: 'ask' }).at(-1)!;
    expect(end.value).toBeCloseTo(174200);
    expect(end.cash).toBeCloseTo(7800);
    expect(end.contributed).toBeCloseTo(174200);
  });
  it('caps an oversized starting ASK balance for a new account', () => {
    const end = project({ ...plan, initial: 200000, monthly: 0, account: 'ask' }).at(-1)!;
    expect(end.value).toBe(tax2026.askLimit);
    expect(end.cash).toBe(25800);
  });
  it('pays ASK tax annually', () => {
    const end = project({
      ...plan,
      initial: 100000,
      monthly: 0,
      account: 'ask',
      returnRate: 10,
    }).at(-1)!;
    expect(end.tax).toBeCloseTo(1700);
    expect(end.value).toBeCloseTo(108300);
  });
  it('carries a loss forward after a crash instead of refunding cash', () => {
    const rows = project(
      { ...plan, initial: 100000, monthly: 0, account: 'ask', returnRate: 10, years: 3 },
      10,
      1,
    );
    expect(rows[1].value).toBeCloseTo(71500);
    expect(rows[1].tax).toBe(0);
    expect(rows[3].tax).toBe(0);
    expect(rows[3].value).toBeCloseTo(86515);
  });
  it('calculates peak-to-trough decline', () => {
    expect(maxDrawdown([100, 120, 90, 110, 80, 130].map((close) => ({ close })))).toBeCloseTo(
      -1 / 3,
    );
  });
});
describe('Danish reference calculators', () => {
  it('applies the individual and eligible spouses thresholds', () => {
    expect(equityTax(100000)).toBe(30090);
    expect(equityTax(100000, true)).toBe(27000);
    expect(equityTax(-100)).toBe(0);
  });
  it('uses previous value and net deposits for ASK room', () => {
    expect(askRoom(105000, 50000)).toBe(19200);
    expect(askRoom(180000, 0)).toBe(0);
    expect(askRoom(180000, -10000)).toBe(4200);
  });
});
describe('portfolio accounting', () => {
  const buy: Transaction = {
    id: 'a',
    date: '2025-01-01',
    instrumentId: 'vwce',
    type: 'buy',
    quantity: 10,
    price: 100,
    fx: 7.5,
    fees: 30,
    note: '',
  };
  it('includes fees and historical FX in basis, then applies average cost on a sale', () => {
    const ledger = [
      buy,
      {
        ...buy,
        id: 'b',
        type: 'sell' as const,
        date: '2025-02-01',
        quantity: 4,
        price: 120,
        fees: 10,
      },
    ];
    const p = portfolio(ledger, demoMarket());
    expect(p.rows[0].units).toBe(6);
    expect(p.rows[0].cost).toBeCloseTo(4518);
    expect(p.realized).toBeCloseTo(578);
    expect(p.netInvested).toBe(3940);
    expect(p.profit).toBeCloseTo(p.value! - 3940);
  });
  it('does not turn missing quotes into zero-valued holdings', () => {
    expect(portfolio([buy], {}).value).toBeNull();
    expect(portfolio([buy], {}).profit).toBeNull();
  });
  it('retains realized profit and dividends after selling all units', () => {
    const p = portfolio(
      [
        buy,
        { ...buy, id: 'b', type: 'dividend', quantity: 10, price: 2, fees: 0 },
        { ...buy, id: 'c', date: '2025-02-01', type: 'sell', price: 120, fees: 10 },
      ],
      {},
    );
    expect(p.value).toBe(0);
    expect(p.dividends).toBe(150);
    expect(p.profit).toBe(1610);
  });
});
