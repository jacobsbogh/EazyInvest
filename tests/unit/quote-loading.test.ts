import { describe, expect, it, vi } from 'vitest';
import { getInstrument } from '../../shared/catalog';
import {
  currentQuote,
  freshQuote,
  mergeQuotes,
  quoteFromSeries,
  quoteIsStale,
  quoteSchema,
} from '../../shared/quote';
import { parseYahooQuote, fetchYahooQuote } from '../../jobs/src/yahoo';
import { ProviderError, fetchAlphaSeries } from '../../jobs/src/alpha-vantage';
import { requestAlpha } from '../../jobs/src/alpha-client';
import { HistoryLoader } from '../../src/lib/history-loader';
import { demoMarket } from '../../src/lib/demo';
import { portfolio } from '../../shared/finance';

const now = new Date('2026-10-04T12:00:00Z');
const quote = () =>
  quoteSchema.parse({
    instrumentId: 'novo',
    currency: 'DKK',
    source: 'Yahoo Finance',
    providerSymbol: 'NOVO-B.CO',
    fetchedAt: now.toISOString(),
    quote: { date: '2026-10-02', close: 300 },
    fxToDkk: 1,
    fxDate: '2026-10-02',
    fxSource: 'ECB',
  });
const response = () => ({
  chart: {
    error: null,
    result: [
      {
        meta: {
          symbol: 'NOVO-B.CO',
          currency: 'DKK',
          exchangeName: 'CPH',
          instrumentType: 'EQUITY',
          exchangeTimezoneName: 'Europe/Copenhagen',
          regularMarketTime: Date.parse('2026-10-02T14:55:00Z') / 1000,
          regularMarketPrice: 300,
        },
      },
    ],
  },
});

describe('independent current quotes', () => {
  it('values holdings with only a raw quote and its own FX without requiring historical points', () => {
    const price = {
      ...quote(),
      instrumentId: 'eunl',
      currency: 'EUR' as const,
      providerSymbol: 'EUNL.DE',
      quote: { date: '2026-10-02', close: 100 },
      fxToDkk: 7.46,
    };
    const tx = {
      id: 'buy',
      instrumentId: 'eunl',
      type: 'buy' as const,
      date: '2026-01-02',
      quantity: 2,
      price: 90,
      fx: 7.4,
      fees: 0,
      note: '',
    };
    expect(portfolio([tx], {}, { eunl: price }).value).toBeCloseTo(1492);
    expect(portfolio([tx], {}).value).toBeNull();
    const newer = {
      ...price,
      quote: { date: '2026-10-03', close: 110 },
      fxToDkk: 8,
      fxDate: '2026-10-02',
    };
    expect(currentQuote(undefined, newer)?.fxToDkk).toBe(8);
  });
  it('validates quote identity, chronology, currency conversion and actual observation age', () => {
    for (const change of [
      { fxToDkk: 2 },
      { fxDate: '2026-10-03' },
      { quote: { date: '2026-10-02', close: -1 } },
      { points: [] },
    ])
      expect(quoteSchema.safeParse({ ...quote(), ...change }).success).toBe(false);
    expect(freshQuote(quote(), getInstrument('novo'), now)).toBe(true);
    expect(freshQuote(quote(), getInstrument('novo'), new Date('2026-10-05T01:00:00Z'))).toBe(
      false,
    );
    expect(
      quoteIsStale({ ...quote(), quote: { date: '2026-09-01', close: 300 } }, now.getTime()),
    ).toBe(true);
    expect(currentQuote(demoMarket().novo, quote())?.quote.close).toBe(300);
    expect(quoteFromSeries(demoMarket().novo)?.source).toBe('demo');
  });
  it('retains missing and newer cached quotes and selects price and FX together', () => {
    const initial = {
      ...quote(),
      instrumentId: 'eunl',
      currency: 'EUR' as const,
      providerSymbol: 'EUNL.DE',
      quote: { date: '2026-10-02', close: 100 },
      fxToDkk: 7.46,
    };
    const previous = { eunl: initial, novo: quote() };
    const older = {
      ...initial,
      quote: { date: '2026-10-01', close: 90 },
      fxDate: '2026-10-01',
      fetchedAt: '2026-10-04T13:00:00Z',
      fxToDkk: 7.4,
    };
    expect(mergeQuotes(previous, [older])).toEqual(previous);
    const checkedAgain = {
      ...initial,
      fetchedAt: '2026-10-04T13:00:00Z',
      quote: { date: '2026-10-02', close: 101 },
      fxToDkk: 7.47,
    };
    expect(mergeQuotes(previous, [checkedAgain])).toEqual({ ...previous, eunl: checkedAgain });
    const fractionalSecond = { ...checkedAgain, fetchedAt: '2026-10-04T13:00:00.500Z' };
    expect(mergeQuotes({ eunl: checkedAgain }, [fractionalSecond]).eunl).toEqual(fractionalSecond);
    expect(mergeQuotes({ eunl: fractionalSecond }, [checkedAgain]).eunl).toEqual(fractionalSecond);
    expect(mergeQuotes(previous, [])).toEqual(previous);
  });
  it('stops the optional fallback on HTTP throttling without reading or retrying the response', async () => {
    const response = new Response('Rate limited', { status: 429 });
    const read = vi.spyOn(response, 'json');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const credit = vi.fn().mockResolvedValue(undefined);
    try {
      for (const request of [
        () => requestAlpha('synthetic-test-key', credit, { function: 'GLOBAL_QUOTE' }),
        () =>
          fetchAlphaSeries(
            getInstrument('msft'),
            'synthetic-test-key',
            { date: '2026-10-02', DKK: 1, EUR: 7.46, USD: 6 },
            credit,
          ),
      ]) {
        fetch.mockClear();
        credit.mockClear();
        await expect(request()).rejects.toMatchObject({ reason: 'quota' });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(credit).toHaveBeenCalledTimes(1);
        expect(read).not.toHaveBeenCalled();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('accepts a bounded chart without historical arrays and rejects substituted/future provider metadata', async () => {
    expect(parseYahooQuote(response(), getInstrument('novo'), [], now)).toEqual(quote());
    for (const change of [
      { currency: 'USD' },
      { symbol: 'NVO' },
      { instrumentType: 'ETF' },
      { exchangeName: 'NYQ' },
      { exchangeTimezoneName: 'America/New_York' },
      { regularMarketTime: now.getTime() / 1000 + 1 },
    ]) {
      const input = response();
      Object.assign(input.chart.result[0].meta, change);
      expect(() => parseYahooQuote(input, getInstrument('novo'), [], now)).toThrow();
    }
    const requests: URL[] = [];
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      requests.push(new URL(String(url)));
      return new Response(JSON.stringify(response()));
    });
    try {
      await fetchYahooQuote(getInstrument('novo'), []);
      expect(requests[0].searchParams.get('range')).toBe('5d');
      expect(requests[0].searchParams.has('period1')).toBe(false);
    } finally {
      mock.mockRestore();
    }
  });
  it('requires FX on/before the quote and treats absent listings as provider failures', () => {
    const input = response();
    Object.assign(input.chart.result[0].meta, {
      symbol: 'EUNL.DE',
      currency: 'EUR',
      exchangeName: 'GER',
      instrumentType: 'ETF',
      exchangeTimezoneName: 'Europe/Berlin',
    });
    expect(() =>
      parseYahooQuote(
        input,
        getInstrument('eunl'),
        [{ date: '2026-10-03', EUR: 7.46, USD: 6, DKK: 1 }],
        now,
      ),
    ).toThrow('FX');
    expect(() =>
      parseYahooQuote({ chart: { error: null, result: [] } }, getInstrument('novo'), [], now),
    ).toThrow('exact listing');
  });
});

describe('session-scoped on-demand history', () => {
  it('does not fetch until requested, deduplicates overlap, remembers missing data and retries explicitly', async () => {
    let resolve!: (value: ReturnType<typeof demoMarket>['novo']) => void;
    const fetch = vi.fn((id: string) =>
      id === 'novo'
        ? new Promise<ReturnType<typeof demoMarket>['novo']>((done) => {
            resolve = done;
          })
        : Promise.resolve(null),
    );
    const publish = vi.fn();
    const state = vi.fn();
    const loader = new HistoryLoader(fetch, state, publish, () => true);
    expect(fetch).not.toHaveBeenCalled();
    const first = loader.load(['novo', 'missing']);
    const second = loader.load(['novo']);
    expect(fetch).toHaveBeenCalledTimes(2);
    resolve(demoMarket().novo);
    expect(await first).toEqual(['ready', 'missing']);
    await second;
    await loader.load(['novo', 'missing']);
    expect(fetch).toHaveBeenCalledTimes(2);
    await loader.load(['missing'], true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('discards late data after sign-out and keeps failures retryable without automatic request loops', async () => {
    let active = true,
      resolve!: (series: ReturnType<typeof demoMarket>['novo']) => void;
    const publish = vi.fn(),
      state = vi.fn();
    const loader = new HistoryLoader(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      state,
      publish,
      () => active,
    );
    const task = loader.load(['novo']);
    active = false;
    resolve(demoMarket().novo);
    await task;
    expect(publish).not.toHaveBeenCalled();
    expect(state).toHaveBeenCalledTimes(1);
    let attempts = 0;
    const retry = new HistoryLoader(
      async () => {
        attempts++;
        if (attempts === 1) throw new ProviderError('unavailable');
        return demoMarket().novo;
      },
      vi.fn(),
      publish,
      () => true,
    );
    expect(await retry.load(['novo'])).toEqual(['error']);
    expect(await retry.load(['novo'])).toEqual(['error']);
    expect(attempts).toBe(1);
    expect(await retry.load(['novo'], true)).toEqual(['ready']);
  });
});
