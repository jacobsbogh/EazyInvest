import { describe, expect, it, vi, afterEach } from 'vitest';
import { danishListings, getInstrument } from '../../shared/catalog';
import { marketSchema } from '../../shared/schema';
import { parseWorkspace } from '../../shared/schema';
import { emptyWorkspace } from '../../src/lib/demo';
import { historicalObservations } from '../../shared/historical-series';
import { freshHistory, historyIsStale, marketMatchesListing } from '../../shared/market-policy';
import {
  parseDanishReferences,
  resolveDanishSymbol,
  fetchDanishListings,
  mergeDanishListings,
} from '../../jobs/src/danish-listings';
import { parseYahooSeries, exchangeDate, fetchYahooSeries } from '../../jobs/src/yahoo';
import { parseNasdaqTrades, selectNasdaqFiles, withNasdaqReference } from '../../jobs/src/nasdaq';

const now = new Date('2026-03-03T18:00:00Z');
const timestamp = (date: string) => Date.parse(date) / 1000;
const item = () => getInstrument('novo');
const fx = [{ date: '2026-03-03', DKK: 1, EUR: 7.46, USD: 6.5 }];
function chart() {
  return {
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
            regularMarketTime: timestamp('2026-03-03T16:00:00Z'),
            regularMarketPrice: 120,
          },
          timestamp: [
            '2025-12-30T08:00:00Z',
            '2026-01-29T08:00:00Z',
            '2026-01-30T08:00:00Z',
            '2026-02-27T08:00:00Z',
            '2026-03-03T08:00:00Z',
          ].map(timestamp),
          indicators: {
            quote: [{ close: [100, 105, 110, 115, 120] }],
            adjclose: [{ adjclose: [90, 94.5, 99, 103.5, 120] }],
          },
        },
      ],
    },
  };
}
afterEach(() => vi.restoreAllMocks());
describe('free Danish catalogue and exact listing identity', () => {
  it('retains removed share classes for saved holdings and updates official names and venues', () => {
    const a = danishListings.find((item) => item.yahooSymbol === 'MAERSK-A.CO')!;
    const b = danishListings.find((item) => item.yahooSymbol === 'MAERSK-B.CO')!;
    const merged = mergeDanishListings(
      [{ ...a, name: 'Updated official name', mic: 'DSME', exchange: 'First North DK' }],
      [a, b],
    );
    expect(merged.find((item) => item.id === a.id)).toMatchObject({
      name: 'Updated official name',
      mic: 'DSME',
      yahooSymbol: 'MAERSK-A.CO',
      referenceStatus: 'current',
    });
    expect(merged.find((item) => item.id === b.id)).toMatchObject({
      isin: b.isin,
      referenceStatus: 'retained',
    });
  });
  it('covers both Copenhagen venues, keeps share classes distinct and preserves Novo IDs', () => {
    expect(danishListings.filter((i) => i.mic === 'XCSE').length).toBeGreaterThan(100);
    expect(danishListings.filter((i) => i.mic !== 'XCSE').length).toBeGreaterThan(20);
    const maersk = danishListings.filter((i) => i.ticker.startsWith('MAERSK-'));
    expect(maersk.map((i) => i.yahooSymbol).sort()).toEqual(['MAERSK-A.CO', 'MAERSK-B.CO']);
    expect(new Set(maersk.map((i) => i.isin)).size).toBe(2);
    expect(item().id).toBe('novo');
    expect(item().yahooSymbol).toBe('NOVO-B.CO');
    expect(danishListings.every((i) => i.yahooSymbol)).toBe(true);
  });
  it('does not mistake nominal capital currency for the listing quote currency', () => {
    const reference = {
      isin: 'DK0062498333',
      mic: 'XCSE',
      gnr_full_name: 'Novo Nordisk B',
      gnr_short_name: 'Novo B',
      gnr_cfi_code: 'ESVUFR',
      gnr_notional_curr_code: 'EUR',
    };
    const result = parseDanishReferences([{ ...reference, mic: 'DSME' }, reference]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'novo',
      mic: 'XCSE',
      ticker: reference.isin,
      currency: 'DKK',
    });
    expect(result[0].yahooSymbol).toBeUndefined();
  });
  it('keeps saved holdings readable when discovered listings enter a later built-in snapshot', () => {
    const listing = danishListings.find((i) => i.ticker === 'DANSKE')!;
    const saved = {
      ...emptyWorkspace(),
      customInstruments: [listing],
      watchlist: [{ instrumentId: listing.id, note: 'Research' }],
    };
    expect(parseWorkspace(saved).customInstruments).toEqual([]);
    expect(parseWorkspace(saved).watchlist[0].instrumentId).toBe(listing.id);
    expect(() =>
      parseWorkspace({ ...saved, customInstruments: [{ ...listing, isin: 'DK0010244425' }] }),
    ).toThrow('Duplicate');
  });
  it('rejects ambiguous ISIN lookups and ADR/ETF matches', () => {
    const quote = { symbol: 'NOVO-B.CO', exchange: 'CPH', quoteType: 'EQUITY' };
    expect(
      resolveDanishSymbol({ quotes: [quote, quote, { ...quote, symbol: 'NVO', exchange: 'NYQ' }] }),
    ).toBe('NOVO-B.CO');
    expect(
      resolveDanishSymbol({ quotes: [quote, { ...quote, symbol: 'NOVO-A.CO' }] }),
    ).toBeUndefined();
    expect(resolveDanishSymbol({ quotes: [{ ...quote, quoteType: 'ETF' }] })).toBeUndefined();
  });
  it('refuses a truncated official reference response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ response: { numFound: 120, docs: [] } })),
    );
    await expect(fetchDanishListings(now)).rejects.toThrow('Incomplete reference');
  });
});
describe('Yahoo daily bars sampled at real month-end dates', () => {
  it('keeps pre-euro native prices while DKK analysis uses the verified ECB era and refuses later FX gaps', () => {
    const input = chart(),
      result = input.chart.result[0];
    Object.assign(result.meta, {
      symbol: 'MSFT',
      currency: 'USD',
      exchangeName: 'NMS',
      exchangeTimezoneName: 'America/New_York',
    });
    result.timestamp[0] = timestamp('1998-12-30T16:00:00Z');
    result.timestamp[1] = timestamp('1999-01-29T16:00:00Z');
    const rates = [
      { date: '1999-01-29', DKK: 1, EUR: 7.46, USD: 6 },
      { date: '2026-01-30', DKK: 1, EUR: 7.46, USD: 6.1 },
      { date: '2026-02-27', DKK: 1, EUR: 7.46, USD: 6.2 },
      ...fx,
    ];
    const series = parseYahooSeries(input, getInstrument('msft'), rates, now);
    expect(historicalObservations(series, 'native').points[0].date).toBe('1998-12-30');
    expect(historicalObservations(series, 'DKK')).toMatchObject({
      missingFx: false,
      points: [
        { date: '1999-01-29' },
        { date: '2026-01-30' },
        { date: '2026-02-27' },
        { date: '2026-03-03' },
      ],
    });
    const broken = parseYahooSeries(
      input,
      getInstrument('msft'),
      rates.filter((rate) => rate.date !== '2026-02-27'),
      now,
    );
    expect(historicalObservations(broken, 'DKK')).toMatchObject({ missingFx: true, points: [] });
  });
  it('uses last published close in each month, preserving dividend adjustments and dated DKK FX', () => {
    const result = parseYahooSeries(chart(), item(), fx, now);
    expect(result.points.map((p) => p.date)).toEqual([
      '2025-12-30',
      '2026-01-30',
      '2026-02-27',
      '2026-03-03',
    ]);
    expect(result.points[1]).toMatchObject({
      close: 110,
      adjustedClose: 99,
      fxToDkk: 1,
      fxDate: '2026-01-30',
    });
    expect(result).toMatchObject({
      source: 'Yahoo Finance',
      closeAdjustment: 'splits',
      quote: { date: '2026-03-03', close: 120 },
    });
    expect(exchangeDate(timestamp('2026-01-31T23:30:00Z'), 'Europe/Copenhagen')).toBe('2026-02-01');
  });
  it('rejects alternate listings, currencies, types and timezones', () => {
    for (const change of [
      { symbol: 'NVO' },
      { currency: 'USD' },
      { exchangeName: 'NYQ' },
      { instrumentType: 'ETF' },
      { exchangeTimezoneName: 'America/New_York' },
    ]) {
      const input = chart();
      Object.assign(input.chart.result[0].meta, change);
      expect(() => parseYahooSeries(input, item(), fx, now)).toThrow('identity');
    }
  });
  it('leaves missing months absent, rejects missing adjustments, and never fills gaps', () => {
    const input = chart(),
      result = input.chart.result[0];
    result.timestamp.splice(3, 1);
    result.indicators.quote[0].close.splice(3, 1);
    result.indicators.adjclose[0].adjclose.splice(3, 1);
    expect(
      parseYahooSeries(input, item(), fx, now).points.some((p) => p.date.startsWith('2026-02')),
    ).toBe(false);
    const invalid = chart();
    (invalid.chart.result[0].indicators.adjclose[0].adjclose as (number | null)[])[1] = null;
    expect(() => parseYahooSeries(invalid, item(), fx, now)).toThrow('Missing adjusted');
  });
  it('retains an older last-trade quote for illiquid shares and exposes it as stale', () => {
    const input = chart();
    input.chart.result[0].meta.regularMarketTime = timestamp('2026-01-30T16:00:00Z');
    const series = parseYahooSeries(input, item(), fx, now);
    expect(series.quote?.date).toBe('2026-01-30');
    expect(historyIsStale(series, now.getTime())).toBe(true);
    expect(freshHistory(series, item(), now.getTime())).toBe(true);
    expect(marketMatchesListing({ ...series, providerSymbol: 'NOVO-A.CO' }, item())).toBe(false);
    expect(freshHistory(series, item(), now.getTime() + 7 * 86400000)).toBe(false);
  });
  it('accepts a Copenhagen investment-company share with its verified EUR quote and provider fund classification', () => {
    const reference = danishListings.find((item) => item.yahooSymbol === 'RLAINV.CO')!;
    expect(reference).toMatchObject({
      currency: 'EUR',
      kind: 'Stock',
      mic: 'XCSE',
      yahooType: 'MUTUALFUND',
    });
    const input = chart();
    Object.assign(input.chart.result[0].meta, {
      symbol: 'RLAINV.CO',
      currency: 'EUR',
      instrumentType: 'MUTUALFUND',
    });
    const history = [
      { date: '2025-12-30', DKK: 1, EUR: 7.46, USD: 6.5 },
      { date: '2026-01-30', DKK: 1, EUR: 7.45, USD: 6.4 },
      { date: '2026-02-27', DKK: 1, EUR: 7.44, USD: 6.3 },
      ...fx,
    ];
    expect(parseYahooSeries(input, reference, history, now).points[0].fxToDkk).toBe(7.46);
    expect(() => parseYahooSeries(input, { ...reference, currency: 'DKK' }, history, now)).toThrow(
      'identity',
    );
  });
  it('rejects future and duplicate daily observations, and future quotes', () => {
    const input = chart();
    input.chart.result[0].timestamp[1] = input.chart.result[0].timestamp[0];
    expect(() => parseYahooSeries(input, item(), fx, now)).toThrow('Duplicate');
    const future = chart();
    future.chart.result[0].meta.regularMarketTime = timestamp('2026-03-04T16:00:00Z');
    expect(() => parseYahooSeries(future, item(), fx, now)).toThrow('Future quote');
    expect(
      marketSchema.safeParse({
        ...parseYahooSeries(chart(), item(), fx, now),
        closeAdjustment: undefined,
      }).success,
    ).toBe(false);
  });
  it('honours source throttling without login, cookies or alternate hosts', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 429 }));
    await expect(fetchYahooSeries(item(), fx)).rejects.toMatchObject({ reason: 'quota' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe('official Nasdaq trade reference, separate from return history', () => {
  const file = 'NordicEquity-posttrade-2026-03-03T1700';
  const header =
    'Trading date and time;Instrument identification code;Price;Price currency;Price notation;Venue of execution;Trading system;Transaction identification code;Flags';
  const row = (
    time: string,
    price: number,
    venue = 'XCSE',
    system = 'CLOB',
    id = 'a',
    flags = 'ALGO',
  ) => `${time};DK0062498333;${price};DKK;MONE;${venue};${system};${id};${flags}`;
  it('selects a bounded local closing-session sample from the newest available day', () => {
    expect(
      selectNasdaqFiles([
        file,
        file.replace('1700', '1705'),
        file.replace('1700', '1800'),
        file.replace('03-03', '03-02'),
        '../../other',
      ]),
    ).toEqual([file, file.replace('1700', '1705')]);
  });
  it('filters off-book, foreign and cancelled trades without altering adjusted analysis', () => {
    const csv = [
      '"sep=;"',
      header,
      row('2026-03-03T16:00:00Z', 121),
      row('2026-03-03T16:00:01Z', 123, 'XCSE', 'OTHR'),
      row('2026-03-03T16:00:02Z', 124, 'XSTO'),
      row('2026-03-03T16:00:03Z', 125, 'XCSE', 'CLOB', 'cancelled'),
      row('2026-03-03T16:00:04Z', 125, 'XCSE', 'CLOB', 'cancelled', 'CNCL'),
    ].join('\n');
    const references = parseNasdaqTrades(csv, file, now),
      series = parseYahooSeries(chart(), item(), fx, now);
    const combined = withNasdaqReference(series, item(), references);
    expect(combined.reportedTrade).toMatchObject({ close: 121, isin: item().isin, mic: 'XCSE' });
    expect(combined.points).toEqual(series.points);
    expect(combined.quote).toEqual(series.quote);
    expect(combined.source).toBe('Yahoo Finance');
    expect(
      withNasdaqReference(series, { ...item(), isin: 'DK0010244425' }, references).reportedTrade,
    ).toBeUndefined();
    expect(() => parseNasdaqTrades('unexpected CSV', file, now)).toThrow('layout changed');
  });
});
