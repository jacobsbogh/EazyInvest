import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getInstrument } from '../../shared/catalog';
import { marketSchema } from '../../shared/schema';
import { historicalComparison } from '../../shared/market';
import { maxDrawdown, portfolio } from '../../shared/finance';
import {
  fetchAlphaSeries,
  parseMonthlyHistory,
  parseLatestQuote,
  validateListing,
} from '../../jobs/src/alpha-vantage';
import { parseEcbRates } from '../../jobs/src/ecb';

const listing = {
  bestMatches: [
    {
      '1. symbol': 'MSFT',
      '2. name': 'Microsoft Corporation',
      '3. type': 'Equity',
      '4. region': 'United States',
      '8. currency': 'USD',
    },
  ],
};
const history = {
  'Meta Data': { '2. Symbol': 'MSFT' },
  'Monthly Adjusted Time Series': {
    '2026-09-30': { '4. close': '50', '5. adjusted close': '50' },
    '2006-09-29': { '4. close': '100', '5. adjusted close': '25' },
  },
};
const quote = {
  'Global Quote': {
    '01. symbol': 'MSFT',
    '05. price': '55',
    '07. latest trading day': '2026-10-02',
  },
};
const series = () =>
  marketSchema.parse({
    instrumentId: 'msft',
    currency: 'USD',
    source: 'Alpha Vantage',
    fetchedAt: '2026-10-04T10:00:00.000Z',
    fxToDkk: 6,
    fxDate: '2026-10-02',
    fxSource: 'ECB',
    providerSymbol: 'MSFT',
    frequency: 'monthly',
    adjustment: 'splits-and-dividends',
    points: parseMonthlyHistory(history, 'MSFT'),
    quote: parseLatestQuote(quote, 'MSFT'),
  });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('free historical provider', () => {
  it('verifies the exact symbol, region, type and currency before accepting a listing', () => {
    expect(validateListing(listing, getInstrument('msft'))).toBe('MSFT');
    for (const change of [
      { '8. currency': 'EUR' },
      { '4. region': 'Germany' },
      { '3. type': 'ETF' },
      { '2. name': 'Other company' },
    ])
      expect(() =>
        validateListing(
          { bestMatches: [{ ...listing.bestMatches[0], ...change }] },
          getInstrument('msft'),
        ),
      ).toThrow('invalid');
    expect(() => validateListing({ bestMatches: [] }, getInstrument('vwce'))).toThrow('coverage');
  });
  it('retains the available historical backfill, with separate raw and adjusted closes', () => {
    expect(parseMonthlyHistory(history, 'MSFT')).toEqual([
      { date: '2006-09-29', close: 100, adjustedClose: 25 },
      { date: '2026-09-30', close: 50, adjustedClose: 50 },
    ]);
    expect(() => parseMonthlyHistory(history, 'OTHER')).toThrow();
    expect(() =>
      parseMonthlyHistory(
        { 'Meta Data': { '2. Symbol': 'MSFT' }, 'Monthly Adjusted Time Series': {} },
        'MSFT',
      ),
    ).toThrow();
    for (const bad of ['0', '-1', 'NaN', 'Infinity', '']) {
      expect(() =>
        parseMonthlyHistory(
          {
            ...history,
            'Monthly Adjusted Time Series': {
              '2026-09-30': { '4. close': bad, '5. adjusted close': '50' },
            },
          },
          'MSFT',
        ),
      ).toThrow();
    }
  });
  it('rejects duplicate monthly periods and future observations', () => {
    expect(() =>
      parseMonthlyHistory(
        {
          ...history,
          'Monthly Adjusted Time Series': {
            ...history['Monthly Adjusted Time Series'],
            '2026-09-29': { '4. close': '50', '5. adjusted close': '50' },
          },
        },
        'MSFT',
      ),
    ).toThrow();
    expect(() =>
      parseLatestQuote(
        { 'Global Quote': { ...quote['Global Quote'], '07. latest trading day': '2099-01-01' } },
        'MSFT',
      ),
    ).toThrow();
    expect(() =>
      marketSchema.parse({ ...series(), points: [...series().points].reverse() }),
    ).toThrow();
    expect(() => marketSchema.parse({ ...series(), quote: undefined })).toThrow();
  });
  it('converts ECB EUR-base rates into DKK per trading-currency unit', () => {
    const xml = `<Cube time='2026-10-02'><Cube currency='USD' rate='1.25'/><Cube currency='DKK' rate='7.5'/></Cube>`;
    expect(parseEcbRates(xml)).toEqual({ date: '2026-10-02', EUR: 7.5, USD: 6, DKK: 1 });
    expect(() => parseEcbRates(xml.replace("rate='1.25'", "rate='NaN'"))).toThrow();
    expect(() => parseEcbRates(xml.replace("currency='USD'", "currency='GBP'"))).toThrow();
  });
  it('uses only free endpoints and never returns the credential as market data', async () => {
    const request = vi.fn();
    for (const body of [listing, history, quote])
      request.mockResolvedValueOnce({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', request);
    const credit = vi.fn().mockResolvedValue(undefined);
    const result = await fetchAlphaSeries(
      getInstrument('msft'),
      'private-test-key',
      { date: '2026-10-02', EUR: 7.5, USD: 6, DKK: 1 },
      credit,
    );
    expect(result.quote).toEqual({ date: '2026-10-02', close: 55 });
    expect(result.points[0].date).toBe('2006-09-29');
    expect(credit).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([url]) => new URL(url).searchParams.get('function'))).toEqual([
      'SYMBOL_SEARCH',
      'TIME_SERIES_MONTHLY_ADJUSTED',
      'GLOBAL_QUOTE',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-test-key');
  });
  it('stops on provider limit/error payloads without exposing their contents', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Information:
          'Our rate limit is 25 requests per day. Subscribe to premium plans. private-test-key',
      }),
    });
    vi.stubGlobal('fetch', request);
    await expect(
      fetchAlphaSeries(
        getInstrument('msft'),
        'private-test-key',
        { date: '2026-10-02', EUR: 7.5, USD: 6, DKK: 1 },
        async () => {},
      ),
    ).rejects.toThrow('quota');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('historical analysis and current valuation', () => {
  it('uses adjusted returns for history, and the raw latest quote for holdings', () => {
    const data = series();
    const comparison = historicalComparison({ msft: data }, ['msft'], 20);
    expect(comparison.adjusted).toBe(true);
    expect(comparison.points.at(-1)!.close / comparison.points[0].close - 1).toBe(1);
    expect(maxDrawdown(comparison.points)).toBe(0);
    const ledger = [
      {
        id: 'buy',
        instrumentId: 'msft' as const,
        type: 'buy' as const,
        date: '2026-01-01',
        quantity: 2,
        price: 40,
        fx: 6,
        fees: 0,
        note: '',
      },
    ];
    const valuation = portfolio(ledger, { msft: data });
    expect(valuation.value).toBe(660); // 2 units × 55 USD × 6 DKK/USD
    expect(valuation.profit).toBe(180); // 660 − 2 × 40 × 6
    expect(valuation.rows[0].quoteDate).toBe('2026-10-02');
  });
  it('compares the same month across different exchange holidays without invented pre-launch data', () => {
    const msft = series();
    const eunl = marketSchema.parse({
      ...msft,
      instrumentId: 'eunl',
      currency: 'EUR',
      providerSymbol: 'EUNL.DEX',
      points: [
        { date: '2025-08-29', close: 100, adjustedClose: 100 },
        { date: '2026-09-29', close: 120, adjustedClose: 120 },
      ],
    });
    const result = historicalComparison({ msft, eunl }, ['msft', 'eunl'], 'all');
    expect(result.dates).toEqual(['2026-09']);
    expect(result.data).toEqual([{ date: '2026-09', msft: 100, eunl: 100 }]);
    expect(historicalComparison({ msft }, ['msft', 'eunl'], 'all').available).toEqual(['msft']);
    const noOverlap = { ...eunl, points: [{ date: '2025-08-29', close: 100, adjustedClose: 100 }] };
    expect(historicalComparison({ msft, eunl: noOverlap }, ['msft', 'eunl'], 'all').points).toEqual(
      [],
    );
  });
});
