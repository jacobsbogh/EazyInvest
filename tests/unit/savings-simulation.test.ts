import { describe, expect, it } from 'vitest';
import type { HistoryObservation } from '../../shared/history-types';
import {
  completedSavingsObservations,
  simulateMonthlySavings,
} from '../../shared/savings-simulation';

const asOf = '2026-10-04';
const options = { monthlyContribution: 1000, asOf };
const values = (prices: number[]): HistoryObservation[] =>
  prices.map((value, index) => ({
    date: ['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30'][index],
    value,
  }));

describe('historical nominal-DKK monthly saving', () => {
  it('keeps contributions separate from gains in a flat market', () => {
    const result = simulateMonthlySavings(values([100, 100, 100]), options);
    expect(result.deposits).toBe(3);
    expect(result.contributed).toBe(3000);
    expect(result.endingValue).toBe(3000);
    expect(result.gain).toBe(0);
    expect(result.points.map((point) => [point.value, point.contributed])).toEqual([
      [1000, 1000],
      [2000, 2000],
      [3000, 3000],
    ]);
  });

  it('grows existing money before each later contribution in a rising then falling market', () => {
    const result = simulateMonthlySavings(values([100, 200, 100]), options);
    // First: 1,000. Second: 1,000 × 2 + 1,000 = 3,000.
    // Third: 3,000 × 0.5 + 1,000 = 2,500; the 3,000 of deposits lost 500.
    expect(result.points.map((point) => point.value)).toEqual([1000, 3000, 2500]);
    expect(result.contributed).toBe(3000);
    expect(result.gain).toBe(-500);
  });

  it('invests an initial lump sum alongside the first contribution', () => {
    const result = simulateMonthlySavings(values([100, 200]), {
      ...options,
      initialInvestment: 2000,
    });
    // 3,000 at the first close grows to 6,000, then receives another 1,000.
    expect(result.points.map((point) => point.value)).toEqual([3000, 7000]);
    expect(result.contributed).toBe(4000);
    expect(result.endingValue).toBe(7000);
    expect(result.gain).toBe(3000);
    expect(result.deposits).toBe(2);
  });

  it('uses changes in supplied dated DKK values, including currency movements', () => {
    // A flat 100 USD instrument converted at 6, 7.5, then 6.75 DKK/USD.
    const result = simulateMonthlySavings(values([600, 750, 675]), options);
    // 1,000 × 1.25 + 1,000 = 2,250; 2,250 × 0.9 + 1,000 = 3,025.
    expect(result.points.map((point) => point.value)).toEqual([1000, 2250, 3025]);
    expect(result.gain).toBe(25);
  });

  it('supports an initial investment without recurring deposits', () => {
    const result = simulateMonthlySavings(values([100, 200, 150]), {
      ...options,
      monthlyContribution: 0,
      initialInvestment: 2000,
    });
    expect(result.contributed).toBe(2000);
    expect(result.endingValue).toBe(3000);
    expect(result.gain).toBe(1000);
    expect(result.deposits).toBe(0);
  });

  it('uses only the selected observed months and does not grant a first-month return', () => {
    const result = simulateMonthlySavings(values([100, 200, 100]), {
      ...options,
      startMonth: '2026-07',
      endMonth: '2026-08',
    });
    expect(result.startMonth).toBe('2026-07');
    expect(result.endMonth).toBe('2026-08');
    expect(result.points.map((point) => point.date)).toEqual(['2026-07-31', '2026-08-31']);
    expect(result.endingValue).toBe(1500);
    expect(result.gain).toBe(-500);
    const singleMonth = simulateMonthlySavings(values([100, 200]), {
      ...options,
      startMonth: '2026-07',
      endMonth: '2026-07',
    });
    expect(singleMonth.endingValue).toBe(1000);
    expect(singleMonth.gain).toBe(0);
  });

  it('excludes an incomplete current UTC month without counting its contribution or return', () => {
    const points = [
      { date: '2026-08-31', value: 100 },
      { date: '2026-09-30', value: 100 },
      { date: '2026-10-02', value: 200 },
    ];
    expect(completedSavingsObservations(points, asOf)).toEqual(points.slice(0, 2));
    const result = simulateMonthlySavings(points, options);
    expect(result.endMonth).toBe('2026-09');
    expect(result.deposits).toBe(2);
    expect(result.endingValue).toBe(2000);
    expect(() => simulateMonthlySavings(points, { ...options, endMonth: '2026-10' })).toThrow(
      'completed DKK observations',
    );
  });

  it('refuses to jump over a missing monthly observation or dated FX value', () => {
    const points = [
      { date: '2026-06-30', value: 100 },
      { date: '2026-08-31', value: 200 },
      { date: '2026-09-30', value: 250 },
    ];
    expect(() => simulateMonthlySavings(points, options)).toThrow('missing monthly observation');
    const shorter = simulateMonthlySavings(points, { ...options, startMonth: '2026-08' });
    expect(shorter.endingValue).toBe(2250);
    expect(shorter.deposits).toBe(2);
  });

  it('requires real ISO dates, ascending observations and one close per month', () => {
    for (const invalidDate of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-9-30', 'bad'])
      expect(() => simulateMonthlySavings([{ date: invalidDate, value: 100 }], options)).toThrow(
        'invalid date',
      );
    expect(() => simulateMonthlySavings(values([100, 200]).reverse(), options)).toThrow(
      'ascending',
    );
    expect(() =>
      simulateMonthlySavings(
        [
          { date: '2026-09-29', value: 100 },
          { date: '2026-09-30', value: 101 },
        ],
        options,
      ),
    ).toThrow('more than one observation');
    expect(() =>
      simulateMonthlySavings(
        [
          { date: '2026-09-30', value: 100 },
          { date: '2026-09-30', value: 101 },
        ],
        options,
      ),
    ).toThrow('ascending');
    expect(() => simulateMonthlySavings([{ date: '2026-10-05', value: 100 }], options)).toThrow(
      'future observation',
    );
    expect(() => simulateMonthlySavings(values([100]), { ...options, asOf: 'invalid' })).toThrow(
      'invalid date',
    );
  });

  it('rejects nonpositive or nonfinite history before filtering incomplete months', () => {
    for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => simulateMonthlySavings(values([invalid, 100]), options)).toThrow(
        'positive, finite',
      );
      expect(() =>
        simulateMonthlySavings([{ date: '2026-10-02', value: invalid }], options),
      ).toThrow('positive, finite');
    }
  });

  it('bounds contributed amounts and requires some invested money', () => {
    for (const invalid of [-1, NaN, Infinity, 1_000_001])
      expect(() =>
        simulateMonthlySavings(values([100]), { ...options, monthlyContribution: invalid }),
      ).toThrow('monthly contribution between');
    for (const invalid of [-1, NaN, Infinity, 100_000_001])
      expect(() =>
        simulateMonthlySavings(values([100]), { ...options, initialInvestment: invalid }),
      ).toThrow('initial investment between');
    expect(() =>
      simulateMonthlySavings(values([100]), { ...options, monthlyContribution: 0 }),
    ).toThrow('greater than zero');
    expect(
      simulateMonthlySavings(values([100]), {
        ...options,
        monthlyContribution: 1_000_000,
        initialInvestment: 100_000_000,
      }).endingValue,
    ).toBe(101_000_000);
  });

  it('rejects invalid, reversed, missing and incomplete period endpoints', () => {
    for (const invalid of ['2026-00', '2026-13', '2026-6', 'bad'])
      expect(() =>
        simulateMonthlySavings(values([100, 200]), { ...options, startMonth: invalid }),
      ).toThrow('valid month');
    expect(() =>
      simulateMonthlySavings(values([100, 200]), {
        ...options,
        startMonth: '2026-07',
        endMonth: '2026-06',
      }),
    ).toThrow('on or before');
    expect(() =>
      simulateMonthlySavings(values([100, 200]), { ...options, startMonth: '2026-05' }),
    ).toThrow('completed DKK observations');
    expect(() => simulateMonthlySavings([], options)).toThrow('No completed');
    expect(() => simulateMonthlySavings([{ date: '2026-10-02', value: 100 }], options)).toThrow(
      'No completed',
    );
  });

  it('rejects overflowing compounded values and leaves input observations untouched', () => {
    expect(() => simulateMonthlySavings(values([1e-308, 1e308]), options)).toThrow(
      'simulation limit',
    );
    expect(() => simulateMonthlySavings(values([1, 1e15]), options)).toThrow('simulation limit');
    const points = values([100, 200, 100]);
    const original = structuredClone(points);
    simulateMonthlySavings(points, options);
    expect(points).toEqual(original);
  });
});
