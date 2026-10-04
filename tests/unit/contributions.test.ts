import { describe, expect, it } from 'vitest';
import {
  contributionPlan,
  contributionQuote,
  type ContributionSettings,
  type ContributionInput,
} from '../../shared/contributions';
import { getInstrument } from '../../shared/catalog';
import { quoteSchema } from '../../shared/quote';
const settings: ContributionSettings = {
  monthly: 1000,
  cash: 0,
  months: 1,
  units: 'whole',
  allocation: 'target',
  feePercent: 0,
  minimumFee: 0,
  fxPercent: 0,
};
const inputs: ContributionInput[] = [
  { id: 'a', weight: 50, heldUnits: 0, currency: 'DKK', priceDkk: 100 },
  { id: 'b', weight: 50, heldUnits: 0, currency: 'EUR', priceDkk: 200 },
];
const run = (s: Partial<ContributionSettings> = {}, i = inputs) =>
  contributionPlan(i, { ...settings, ...s });
describe('cash-bounded manual contribution worksheets', () => {
  it('buys affordable whole units and carries residual cash', () => {
    const p = run({ months: 2 });
    expect(p[0].orders.map((o) => o.quantity)).toEqual([5, 2]);
    expect(p[0].spent).toBe(900);
    expect(p[0].closingCash).toBe(100);
    expect(p[1].openingCash).toBe(100);
    expect(p[1].available).toBe(1100);
    expect(p[1].spent).toBe(900);
    expect(p[1].closingCash).toBe(200);
    expect(p[1].orders[0].heldValue).toBe(1000);
  });
  it('reserves minimum commission and conversion costs before sizing units', () => {
    const p = run({ minimumFee: 10, fxPercent: 1 })[0];
    expect(p.orders.map((o) => o.quantity)).toEqual([4, 2]);
    expect(p.orders.map((o) => o.commission)).toEqual([10, 10]);
    expect(p.orders.map((o) => o.fxCost)).toEqual([0, 4]);
    expect(p.spent).toBe(824);
    expect(p.fees).toBe(24);
    expect(p.closingCash).toBe(176);
  });
  it('uses percentage commission when it exceeds the minimum', () => {
    const p = run({ feePercent: 2, minimumFee: 1 })[0];
    expect(p.orders[0].quantity).toBe(4);
    expect(p.orders[0].commission).toBe(8);
    expect(p.orders[1].quantity).toBe(2);
    expect(p.orders[1].commission).toBe(8);
    expect(p.spent).toBe(816);
    expect(p.closingCash).toBe(184);
  });
  it('supports six-decimal fractional units without overspending', () => {
    const p = run({ units: 'fractional', minimumFee: 10, fxPercent: 1 })[0];
    expect(p.orders[0].quantity).toBeCloseTo(4.9, 6);
    // 485.14 notional + 4.86 conversion reserve + 10 commission fits exactly.
    expect(p.orders[1].quantity).toBeCloseTo(2.4257, 6);
    expect(p.spent).toBeLessThanOrEqual(1000);
    expect(p.closingCash).toBeLessThan(0.03);
  });
  it('keeps unpriced allocations in cash and never creates unknown-price orders', () => {
    const p = run({}, [{ ...inputs[0] }, { ...inputs[1], priceDkk: undefined }])[0];
    expect(p.orders[1].available).toBe(false);
    expect(p.orders[1].quantity).toBe(0);
    expect(p.spent).toBe(500);
    expect(p.closingCash).toBe(500);
    expect(
      run({ allocation: 'gaps' }, [
        { ...inputs[0] },
        { ...inputs[1], priceDkk: undefined, heldUnits: 1 },
      ])[0].issue,
    ).toContain('valid prices');
  });
  it('directs money to underweights without selling the overweight holding', () => {
    const p = run({ allocation: 'gaps' }, [
      { ...inputs[0], heldUnits: 9 },
      { ...inputs[1], heldUnits: 0.5 },
    ])[0];
    // 900/100 -> target 1,000/1,000 after adding 1,000: deficits 100/900.
    expect(p.orders.map((o) => o.budget)).toEqual([100, 900]);
    expect(p.orders.map((o) => o.quantity)).toEqual([1, 4]);
    expect(p.orders.map((o) => o.heldValue)).toEqual([1000, 900]);
    const small = run({ monthly: 100, allocation: 'gaps' }, [
      { ...inputs[0], heldUnits: 9 },
      { ...inputs[1], heldUnits: 0.5 },
    ])[0];
    expect(small.orders.map((o) => o.budget)).toEqual([0, 100]);
    expect(small.orders.every((o) => o.quantity >= 0)).toBe(true);
  });
  it('does not charge a fee when no unit fits', () => {
    const p = run({ monthly: 10, minimumFee: 20 })[0];
    expect(p.spent).toBe(0);
    expect(p.fees).toBe(0);
    expect(p.closingCash).toBe(10);
  });
  it('distributes leftover cents deterministically and conserves cash for all months', () => {
    const p = run({ monthly: 0.01, months: 12, minimumFee: 10 });
    expect(p[0].orders.map((o) => o.budget)).toEqual([0.01, 0]);
    for (const month of p)
      expect(Math.round(month.spent * 100) + Math.round(month.closingCash * 100)).toBe(
        Math.round(month.available * 100),
      );
    expect(p[11].closingCash).toBe(0.12);
  });
  it('rejects invalid prices, allocations and settings', () => {
    expect(() => run({}, [{ ...inputs[0], weight: 60 }, inputs[1]])).toThrow();
    expect(() => run({}, [{ ...inputs[0], priceDkk: NaN }, inputs[1]])).toThrow();
    expect(() => run({ months: 13 })).toThrow();
    expect(() => run({ cash: Infinity })).toThrow();
    expect(() => run({ monthly: 10.001 })).toThrow();
    expect(() => run({ cash: 0.001 })).toThrow();
    expect(() => run({ minimumFee: 1.005 })).toThrow();
  });
});

describe('contribution prices require the exact listing and dated FX', () => {
  const item = getInstrument('eunl');
  const now = Date.parse('2026-10-04T12:00:00Z');
  const quote = quoteSchema.parse({
    instrumentId: 'eunl',
    currency: 'EUR',
    source: 'Yahoo Finance',
    providerSymbol: 'EUNL.DE',
    fetchedAt: '2026-10-04T10:00:00Z',
    quote: { date: '2026-10-02', close: 100 },
    fxToDkk: 7.46,
    fxDate: '2026-10-02',
    fxSource: 'ECB',
  });
  it('uses the quote and its own FX together without historical prices', () => {
    expect(contributionQuote(quote, item, false, now).priceDkk).toBe(746);
    expect(contributionQuote(quote, item, false, now).quote?.fxDate).toBe('2026-10-02');
  });
  it('blocks stale, future, mismatched and invalid price records', () => {
    for (const change of [
      { quote: { date: '2026-09-30', close: 100 }, fxDate: '2026-09-30' },
      { fetchedAt: '2026-10-05T00:00:00Z' },
      { providerSymbol: 'VWCE.DE' },
      { instrumentId: 'vwce' },
      { fxDate: '2026-10-03' },
      { quote: { date: '2026-10-02', close: Infinity } },
    ]) {
      const result = contributionQuote({ ...quote, ...change }, item, false, now);
      expect(result.priceDkk).toBeUndefined();
      expect(result.issue).toBeTruthy();
    }
    expect(contributionQuote(undefined, item, false, now).priceDkk).toBeUndefined();
  });
  it('accepts generated examples only in explicit demo mode and for the same instrument', () => {
    const demo = {
      ...quote,
      source: 'demo' as const,
      fetchedAt: '2025-01-01T00:00:00Z',
      quote: { date: '2025-01-01', close: 100 },
      fxDate: '2025-01-01',
    };
    expect(contributionQuote(demo, item, true, now).priceDkk).toBe(746);
    expect(contributionQuote(demo, item, false, now).priceDkk).toBeUndefined();
    expect(
      contributionQuote({ ...demo, instrumentId: 'vwce' }, item, true, now).priceDkk,
    ).toBeUndefined();
  });
});
