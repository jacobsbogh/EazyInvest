import { describe, expect, it } from 'vitest';
import { strategySchema, type Strategy } from '../../shared/strategy';
import { commonStrategyHistory, backtestStrategy } from '../../shared/portfolio-history';
import { parseWorkspace, type MarketSeries } from '../../shared/schema';
import { emptyWorkspace, demoWorkspace } from '../../src/lib/demo';
import { fundFacts, weightedFundCost } from '../../shared/fund-facts';
import { instruments, getInstrument } from '../../shared/catalog';

const strategy = (change: Partial<Strategy> = {}): Strategy => ({
  id: 'test',
  name: 'Test strategy',
  allocations: [{ instrumentId: 'vwce', weight: 100 }],
  initial: 1000,
  monthly: 0,
  goal: 100000,
  account: 'none',
  rebalance: 'none',
  note: 'My reasoning',
  startMonth: null,
  endMonth: null,
  ...change,
});
const series = (id: string, values: number[], start = 0): MarketSeries => ({
  instrumentId: id,
  currency: 'EUR',
  source: 'Alpha Vantage',
  providerSymbol: `${id.toUpperCase()}.DEX`,
  frequency: 'monthly',
  adjustment: 'splits-and-dividends',
  fetchedAt: '2025-06-01T00:00:00.000Z',
  fxToDkk: 7,
  fxDate: '2025-05-30',
  fxSource: 'ECB',
  quote: { date: '2025-05-30', close: 9999 },
  points: values.map((value, i) => {
    const date = new Date(Date.UTC(2024, 11 + start + i, 0)).toISOString().slice(0, 10);
    return { date, close: value * 4, adjustedClose: value, fxToDkk: 7, fxDate: date };
  }),
});
const options = { asOf: '2025-06-01' };
describe('saved strategies and migrations', () => {
  it('migrates genuine v1/v2 backups while retaining their records', () => {
    const {
      customInstruments,
      strategies: _s,
      preferredStrategyId: _p,
      ...legacy
    } = demoWorkspace();
    const v1 = parseWorkspace({ ...legacy, version: 1 });
    expect(v1.transactions).toEqual(legacy.transactions);
    expect(v1.watchlist).toEqual(legacy.watchlist);
    expect(v1.strategies).toEqual([]);
    expect(v1.preferredStrategyId).toBeNull();
    expect(parseWorkspace({ ...legacy, version: 2, customInstruments })).toEqual(v1);
    expect(
      parseWorkspace(
        JSON.parse(
          JSON.stringify({ ...v1, strategies: [strategy()], preferredStrategyId: 'test' }),
        ),
      ),
    ).toMatchObject({ preferredStrategyId: 'test', strategies: [strategy()] });
  });
  it('rejects bad allocations, duplicate investments, impossible dates and empty budgets', () => {
    for (const input of [
      strategy({ allocations: [{ instrumentId: 'vwce', weight: 99 }] }),
      strategy({
        allocations: [
          { instrumentId: 'vwce', weight: 50 },
          { instrumentId: 'vwce', weight: 50 },
        ],
      }),
      strategy({ initial: 0, monthly: 0 }),
      strategy({ initial: Infinity }),
      strategy({ startMonth: '2025-13' }),
      strategy({ startMonth: '2025-04', endMonth: '2025-01' }),
    ])
      expect(strategySchema.safeParse(input).success).toBe(false);
  });
  it('rejects unknown investments, duplicate strategies and a missing preferred choice', () => {
    const base = emptyWorkspace();
    for (const data of [
      {
        ...base,
        strategies: [strategy({ allocations: [{ instrumentId: 'unknown', weight: 100 }] })],
      },
      { ...base, strategies: [strategy(), strategy()] },
      { ...base, preferredStrategyId: 'missing' },
    ])
      expect(() => parseWorkspace(data)).toThrow();
  });
});
describe('independent historical portfolio calculations', () => {
  it('reports the smallest observed gain when every month is positive', () => {
    const s = strategy();
    const h = commonStrategyHistory([s], { vwce: series('vwce', [100, 110, 132]) }, options);
    expect(backtestStrategy(s, h).worstMonth).toBeCloseTo(0.1);
  });
  it('keeps flat investments equal to contributions', () => {
    const s = strategy({ initial: 200, monthly: 100 });
    const h = commonStrategyHistory([s], { vwce: series('vwce', [100, 100, 100]) }, options);
    const r = backtestStrategy(s, h);
    expect(r.contributed).toBe(500);
    expect(r.value).toBe(500);
    expect(r.gain).toBe(0);
    expect(r.drawdown).toBe(0);
  });
  it('does not hide a 50% investment fall behind monthly deposits', () => {
    const s = strategy({ initial: 0, monthly: 1000 });
    const h = commonStrategyHistory([s], { vwce: series('vwce', [100, 200, 100]) }, options);
    const r = backtestStrategy(s, h);
    expect(r.value).toBe(2500);
    expect(r.contributed).toBe(3000);
    expect(r.gain).toBe(-500);
    expect(r.drawdown).toBeCloseTo(-0.5);
    expect(r.points.map((p) => p.index)).toEqual([100, 200, 100]);
    expect(r.recoveryMonth).toBeNull();
    expect(backtestStrategy(s, h, { monthly: 100000 }).drawdown).toBe(r.drawdown);
  });
  it('measures peak-to-recovery time after the deepest fall', () => {
    const s = strategy();
    const h = commonStrategyHistory([s], { vwce: series('vwce', [100, 50, 80, 100]) }, options);
    expect(backtestStrategy(s, h)).toMatchObject({
      peakMonth: '2024-11',
      troughMonth: '2024-12',
      recoveryMonth: '2025-02',
      recoveryMonths: 3,
    });
  });
  it('distinguishes drifting allocations from annual rebalancing', () => {
    const s = strategy({
      allocations: [
        { instrumentId: 'vwce', weight: 50 },
        { instrumentId: 'eunl', weight: 50 },
      ],
    });
    const h = commonStrategyHistory(
      [s],
      { vwce: series('vwce', [100, 200, 200, 100]), eunl: series('eunl', [100, 100, 200, 200]) },
      options,
    );
    // Buy-and-hold: 500->500 and 500->1000 = 1500.
    expect(backtestStrategy(s, h).value).toBe(1500);
    // December: 1000+500 -> 750 each; January 750+1500; February 375+1500.
    expect(backtestStrategy({ ...s, rebalance: 'annual' }, h).value).toBe(1875);
  });
  it('compares identical budgets and respects a different start month', () => {
    const s = strategy({ monthly: 100 });
    const other = strategy({ id: 'other', initial: 50000, monthly: 9000 });
    const h = commonStrategyHistory([s, other], { vwce: series('vwce', [100, 200, 100]) }, options);
    const a = backtestStrategy(s, h);
    const b = backtestStrategy(other, h, { initial: s.initial, monthly: s.monthly });
    expect(a).toEqual(b);
    const later = backtestStrategy(s, h, { startMonth: '2024-12' });
    expect(later.contributed).toBe(1200);
    expect(later.value).toBe(650);
  });
  it('uses dated DKK adjusted observations rather than raw current quotes', () => {
    const s = strategy();
    const m = series('vwce', [100, 100, 100]);
    m.points = m.points.map((p, i) => ({ ...p, fxToDkk: 6 + i }));
    const h = commonStrategyHistory([s], { vwce: m }, options);
    expect(backtestStrategy(s, h).value).toBeCloseTo((1000 * 8) / 6);
    expect(h.months[0].values.vwce).toBe(600);
  });
  it('uses only common completed months and rejects gaps instead of bridging', () => {
    const s = strategy({
      allocations: [
        { instrumentId: 'vwce', weight: 50 },
        { instrumentId: 'eunl', weight: 50 },
      ],
    });
    const all = series('vwce', [100, 100, 100, 100, 100]);
    const shorter = series('eunl', [100, 100, 100, 100], 1);
    for (const m of [all, shorter])
      m.points[m.points.length - 1] = {
        ...m.points.at(-1)!,
        date: '2025-03-10',
        fxDate: '2025-03-10',
      };
    const h = commonStrategyHistory([s], { vwce: all, eunl: shorter }, { asOf: '2025-03-15' });
    expect(h.months.map((m) => m.month)).toEqual(['2024-12', '2025-01', '2025-02']);
    all.points.splice(2, 1);
    expect(() =>
      backtestStrategy(s, commonStrategyHistory([s], { vwce: all, eunl: shorter }, options)),
    ).toThrow('missing monthly');
  });
  it('rejects missing FX, mismatched identities, demo mixing and numeric overflow', () => {
    const s = strategy();
    const m = series('vwce', [100, 100]);
    const legacy = { ...m, points: m.points.map(({ fxToDkk: _f, fxDate: _d, ...p }) => p) };
    expect(() => commonStrategyHistory([s], { vwce: legacy }, options)).toThrow('exchange rates');
    expect(() =>
      commonStrategyHistory([s], { vwce: { ...m, instrumentId: 'eunl' } }, options),
    ).toThrow('does not match');
    expect(() => commonStrategyHistory([s], { vwce: { ...m, source: 'demo' } }, options)).toThrow(
      'does not match',
    );
    const huge = commonStrategyHistory([s], { vwce: series('vwce', [0.0001, 1e20]) }, options);
    expect(() => backtestStrategy(s, huge)).toThrow('limit');
  });
});
describe('verified fund and tax facts', () => {
  it('keeps charges and tax classification unknown for investment-company shares', () => {
    const companies = instruments.filter(
      (item) => item.kind === 'Stock' && item.yahooType === 'MUTUALFUND',
    );
    expect(companies).toHaveLength(3);
    for (const item of companies) {
      expect(fundFacts(item, 2026).cost).toBeUndefined();
      expect(fundFacts(item, 2026).taxStatus).not.toBe('not-applicable');
      expect(
        weightedFundCost(
          strategy({ allocations: [{ instrumentId: item.id, weight: 100 }] }),
          instruments,
        ),
      ).toBeNull();
    }
    expect(
      weightedFundCost(
        strategy({ allocations: [{ instrumentId: 'msft', weight: 100 }] }),
        instruments,
      ),
    ).toBe(0);
  });
  it('matches exact ISINs and exposes current-year uncertainty', () => {
    expect(fundFacts(getInstrument('eunl'), 2026).taxStatus).toBe('listed');
    expect(fundFacts(getInstrument('vwce'), 2026).taxStatus).toBe('not-found');
    expect(fundFacts(getInstrument('eunl'), 2027).taxStatus).toBe('unknown');
    expect(fundFacts({ ...getInstrument('eunl'), isin: '' }, 2026).taxStatus).toBe('unknown');
    expect(fundFacts({ ...getInstrument('eunl'), isin: 'IE000QWO5FT3' }, 2026).taxStatus).toBe(
      'unknown',
    );
  });
  it('computes weighted issuer charges and leaves unknown costs unknown', () => {
    const s = strategy({
      allocations: [
        { instrumentId: 'eunl', weight: 80 },
        { instrumentId: 'is3n', weight: 20 },
      ],
    });
    expect(weightedFundCost(s, instruments)).toBeCloseTo(0.196);
    expect(
      weightedFundCost(
        s,
        instruments.map((i) => (i.id === 'eunl' ? { ...i, isin: '' } : i)),
      ),
    ).toBeNull();
  });
});
