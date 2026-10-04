import { describe, expect, it } from 'vitest';
import { marketSchema } from '../../shared/schema';
import { historicalObservations } from '../../shared/historical-series';
import { historicalComparison, latestQuote } from '../../shared/market';
import { analyzeHistory } from '../../shared/history-analysis';
import { simulateMonthlySavings } from '../../shared/savings-simulation';

describe('dated currency observations across historical features', () => {
  const series = marketSchema.parse({
    instrumentId: 'msft',
    currency: 'USD',
    source: 'Alpha Vantage',
    providerSymbol: 'MSFT',
    frequency: 'monthly',
    adjustment: 'splits-and-dividends',
    fetchedAt: '2026-10-04T10:00:00.000Z',
    fxToDkk: 99,
    fxDate: '2026-10-02',
    fxSource: 'ECB',
    quote: { date: '2026-10-02', close: 999 },
    points: [
      { date: '2025-01-31', close: 80, adjustedClose: 100, fxToDkk: 6, fxDate: '2025-01-31' },
      { date: '2025-02-28', close: 90, adjustedClose: 100, fxToDkk: 7, fxDate: '2025-02-28' },
      { date: '2025-03-31', close: 100, adjustedClose: 100, fxToDkk: 8, fxDate: '2025-03-31' },
    ],
  });

  it('uses dated FX and adjusted closes consistently, keeping the raw quote separate', () => {
    const dkk = historicalObservations(series, 'DKK');
    expect(dkk.points.map((point) => point.value)).toEqual([600, 700, 800]);
    const comparison = historicalComparison({ msft: series }, ['msft'], 'all', 'DKK');
    expect(comparison.points.map((point) => point.close)).toEqual([600, 700, 800]);
    const analysis = analyzeHistory(dkk.points, { asOf: '2026-10-04' });
    expect(analysis.headline?.totalReturn).toBeCloseTo(1 / 3);
    const savings = simulateMonthlySavings(dkk.points, {
      monthlyContribution: 1000,
      asOf: '2026-10-04',
    });
    // Three month-end contributions: 1000*(8/6) + 1000*(8/7) + 1000.
    expect(savings.endingValue).toBeCloseTo(3476.190476190476);
    expect(savings.contributed).toBe(3000);
    expect(savings.gain).toBeCloseTo(476.190476190476);
    expect(latestQuote(series)).toEqual({ date: '2026-10-02', close: 999 });
  });

  it('keeps native analysis available when historical FX is absent', () => {
    const legacy = {
      ...series,
      points: series.points.map(({ fxToDkk: _fx, fxDate: _date, ...point }) => point),
    };
    const dkk = historicalObservations(legacy, 'DKK');
    expect(dkk.missingFx).toBe(true);
    expect(dkk.points).toEqual([]);
    expect(analyzeHistory(dkk.points, { asOf: '2026-10-04' }).headline).toBeNull();
    const native = historicalObservations(legacy, 'native');
    expect(analyzeHistory(native.points, { asOf: '2026-10-04' }).headline?.totalReturn).toBe(0);
  });
});
