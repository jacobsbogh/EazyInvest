import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketSchema, type MarketSeries } from '../../shared/schema';
import { historicalObservations } from '../../shared/historical-series';
import { historicalComparison } from '../../shared/market';
import { portfolio } from '../../shared/finance';
import { demoMarket } from '../../src/lib/demo';
import {
  fetchEcbHistory,
  historicalFxForDate,
  parseEcbHistory,
  withHistoricalFx,
} from '../../jobs/src/ecb';

// Independent arithmetic: 7.5 DKK/EUR divided by 1.25 USD/EUR = 6 DKK/USD.
// USD then strengthens to parity with EUR while DKK/EUR stays fixed at 7.5.
const xml = `<gesmes:Envelope><Cube>
  <Cube time='2024-02-29'><Cube currency='USD' rate='1'/><Cube currency='DKK' rate='7.5'/></Cube>
  <Cube time='2024-01-31'><Cube currency='USD' rate='1.25'/><Cube currency='DKK' rate='7.5'/></Cube>
</Cube></gesmes:Envelope>`;
const fxHistory = () => parseEcbHistory(xml);
const legacy = (): MarketSeries =>
  marketSchema.parse({
    instrumentId: 'msft',
    currency: 'USD',
    source: 'Alpha Vantage',
    fetchedAt: '2024-03-02T12:00:00.000Z',
    fxToDkk: 6.8,
    fxDate: '2024-03-01',
    fxSource: 'ECB',
    frequency: 'monthly',
    adjustment: 'splits-and-dividends',
    providerSymbol: 'MSFT',
    points: [
      { date: '2024-01-31', close: 100, adjustedClose: 50 },
      { date: '2024-02-29', close: 120, adjustedClose: 60 },
    ],
    quote: { date: '2024-03-01', close: 70 },
  });

afterEach(() => vi.unstubAllGlobals());

describe('dated ECB reference rates', () => {
  it('parses and sorts the full-history shape with independently calculated EUR/USD cross rates', () => {
    expect(fxHistory()).toEqual([
      { date: '2024-01-31', EUR: 7.5, USD: 6, DKK: 1 },
      { date: '2024-02-29', EUR: 7.5, USD: 7.5, DKK: 1 },
    ]);
    for (const bad of [
      xml.replace("rate='1.25'", "rate='NaN'"),
      xml.replace("currency='USD'", "currency='GBP'"),
      xml.replace('2024-01-31', '2024-02-29'),
      xml.replace('2024-01-31', '2099-01-31'),
      xml.replace('2024-01-31', '2024-02-30'),
      '<Cube></Cube>',
    ])
      expect(() => parseEcbHistory(bad)).toThrow();
  });

  it('uses the preceding TARGET holiday observation, accepts seven days and rejects eight', () => {
    const history = parseEcbHistory(`<Cube>
      <Cube time='2024-03-28'><Cube currency='USD' rate='1.25'/><Cube currency='DKK' rate='7.5'/></Cube>
      <Cube time='2024-04-02'><Cube currency='USD' rate='1'/><Cube currency='DKK' rate='7.5'/></Cube>
    </Cube>`);
    // The US exchange opens on Easter Monday; the ECB has no new reference rate.
    expect(historicalFxForDate(history, '2024-04-01', 'USD')).toEqual({
      fxToDkk: 6,
      fxDate: '2024-03-28',
    });
    expect(historicalFxForDate(history.slice(0, 1), '2024-04-04', 'EUR')).toEqual({
      fxToDkk: 7.5,
      fxDate: '2024-03-28',
    });
    expect(historicalFxForDate(history.slice(0, 1), '2024-04-05', 'USD')).toBeUndefined();
    expect(historicalFxForDate(history.slice(1), '2024-04-01', 'USD')).toBeUndefined();
    expect(historicalFxForDate([], '1998-12-31', 'DKK')).toEqual({
      fxToDkk: 1,
      fxDate: '1998-12-31',
    });
  });

  it('downloads only the free full-history ECB file', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, text: async () => xml });
    vi.stubGlobal('fetch', request);
    expect(await fetchEcbHistory()).toEqual(fxHistory());
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(
      'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml',
    );
    request.mockResolvedValue({ ok: false });
    await expect(fetchEcbHistory()).rejects.toThrow('unavailable');
  });
});

describe('DKK historical observations', () => {
  it('includes dated currency movements in adjusted USD returns and leaves EUR returns unchanged', () => {
    const msft = withHistoricalFx(legacy(), fxHistory());
    const native = historicalObservations(msft, 'native');
    const dkk = historicalObservations(msft, 'DKK');
    expect(native).toEqual({
      points: [
        { date: '2024-01-31', value: 50 },
        { date: '2024-02-29', value: 60 },
      ],
      currency: 'USD',
      adjusted: true,
      missingFx: false,
    });
    expect(dkk).toEqual({
      points: [
        { date: '2024-01-31', value: 300 },
        { date: '2024-02-29', value: 450 },
      ],
      currency: 'DKK',
      adjusted: true,
      missingFx: false,
    });
    expect(native.points[1].value / native.points[0].value - 1).toBeCloseTo(0.2);
    expect(dkk.points[1].value / dkk.points[0].value - 1).toBeCloseTo(0.5);
    const eur = withHistoricalFx(
      marketSchema.parse({
        ...legacy(),
        instrumentId: 'vwce',
        currency: 'EUR',
        providerSymbol: 'VWCE.DEX',
      }),
      fxHistory(),
    );
    expect(historicalObservations(eur, 'DKK').points.map((point) => point.value)).toEqual([
      375, 450,
    ]);
    const comparison = historicalComparison({ msft, vwce: eur }, ['msft', 'vwce'], 'all', 'DKK');
    expect(comparison.data).toEqual([
      { date: '2024-01', msft: 100, vwce: 100 },
      { date: '2024-02', msft: 150, vwce: 120 },
    ]);
    expect(comparison.points).toEqual([
      { date: '2024-01-31', close: 300 },
      { date: '2024-02-29', close: 450 },
    ]);
  });

  it('reads legacy caches without synthetic DKK returns and refuses a partial FX series', () => {
    const data = legacy();
    expect(marketSchema.safeParse(data).success).toBe(true);
    expect(historicalObservations(data, 'native').points).toHaveLength(2);
    expect(historicalObservations(data, 'DKK')).toEqual({
      points: [],
      currency: 'DKK',
      adjusted: true,
      missingFx: true,
    });
    const partial = withHistoricalFx(data, fxHistory().slice(1));
    expect(partial.points[0].fxToDkk).toBeUndefined();
    expect(partial.points[1].fxToDkk).toBe(7.5);
    expect(historicalObservations(partial, 'DKK').points).toEqual([]);
    expect(historicalComparison({ msft: partial }, ['msft'], 'all', 'DKK').missingFx).toBe(true);
    expect(historicalComparison({ msft: partial }, ['msft'], 'all', 'DKK').available).toEqual([]);
  });

  it('keeps a comparison of adjusted and price-only sources consistently on raw closes', () => {
    const msft = withHistoricalFx(legacy(), fxHistory());
    const priceOnly = withHistoricalFx(
      marketSchema.parse({
        ...legacy(),
        instrumentId: 'vwce',
        currency: 'EUR',
        source: 'Twelve Data',
        adjustment: undefined,
      }),
      fxHistory(),
    );
    const comparison = historicalComparison(
      { msft, vwce: priceOnly },
      ['msft', 'vwce'],
      'all',
      'DKK',
    );
    expect(comparison.adjusted).toBe(false);
    expect(comparison.points).toEqual([
      { date: '2024-01-31', close: 600 },
      { date: '2024-02-29', close: 900 },
    ]);
    // Single-series statistics still use the provider-adjusted observations.
    expect(historicalObservations(msft, 'DKK').points[0].value).toBe(300);
  });

  it('rejects forward, outdated and incomplete FX fields in stored points', () => {
    for (const fields of [
      { fxToDkk: 6, fxDate: '2024-02-01' },
      { fxToDkk: 6, fxDate: '2024-01-23' },
      { fxToDkk: 0, fxDate: '2024-01-31' },
      { fxToDkk: Infinity, fxDate: '2024-01-31' },
      { fxToDkk: 6 },
      { fxDate: '2024-01-31' },
    ])
      expect(
        marketSchema.safeParse({
          ...legacy(),
          points: [{ ...legacy().points[0], ...fields }],
        }).success,
      ).toBe(false);
    // The helper also refuses invalid FX passed by an unvalidated caller.
    for (const fxDate of ['2024-02-01', '2024-01-23']) {
      const data = { ...legacy(), points: [{ ...legacy().points[0], fxToDkk: 6, fxDate }] };
      expect(historicalObservations(data, 'DKK').missingFx).toBe(true);
    }
  });

  it('uses raw closes without adjustment provenance and identity conversion for DKK', () => {
    const data = marketSchema.parse({
      instrumentId: 'novo',
      currency: 'DKK',
      source: 'Twelve Data',
      fetchedAt: '2024-03-02T12:00:00.000Z',
      fxToDkk: 1,
      fxDate: '2024-03-01',
      points: legacy().points,
    });
    expect(historicalObservations(data, 'DKK')).toEqual({
      points: [
        { date: '2024-01-31', value: 100 },
        { date: '2024-02-29', value: 120 },
      ],
      currency: 'DKK',
      adjusted: false,
      missingFx: false,
    });
    expect(historicalObservations(undefined, 'DKK').points).toEqual([]);
    expect(
      marketSchema.safeParse({
        ...data,
        points: [{ ...data.points[0], fxToDkk: 2, fxDate: data.points[0].date }],
      }).success,
    ).toBe(false);
  });

  it('backfills without provider requests or changing the current quote, timestamp or holdings valuation', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const original = legacy();
    const enriched = withHistoricalFx(original, fxHistory());
    expect(request).not.toHaveBeenCalled();
    expect(enriched.fetchedAt).toBe(original.fetchedAt);
    expect(enriched.quote).toEqual(original.quote);
    expect(enriched.fxToDkk).toBe(6.8);
    expect(enriched.fxDate).toBe('2024-03-01');
    expect(original.points.every((point) => point.fxToDkk === undefined)).toBe(true);
    const transactions = [
      {
        id: 'buy',
        instrumentId: 'msft' as const,
        type: 'buy' as const,
        date: '2024-01-01',
        quantity: 2,
        price: 40,
        fx: 6,
        fees: 0,
        note: '',
      },
    ];
    const current = portfolio(transactions, { msft: enriched });
    expect(current.value).toBe(952); // 2 actual units × raw quote 70 USD × current 6.8 DKK/USD.
    expect(current.profit).toBe(472); // 952 − 2 × 40 × purchase-date 6.
    expect(current.rows[0].quoteDate).toBe('2024-03-01');
    expect(current).toEqual(portfolio(transactions, { msft: original }));
  });

  it('keeps demo historical FX explicitly generated and separate from ECB provenance', () => {
    for (const data of Object.values(demoMarket())) {
      expect(marketSchema.safeParse(data).success).toBe(true);
      expect(data.source).toBe('demo');
      expect(data.fxSource).toBeUndefined();
      expect(data.frequency).toBe('monthly');
      expect(historicalObservations(data, 'DKK').missingFx).toBe(false);
    }
  });
});
