import { z } from 'zod';
import type { Instrument } from '../../shared/instrument.js';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import { historicalFxForDate, withHistoricalFx, type FxRates } from './ecb.js';
import { publicFetch } from './http.js';
import { ProviderError } from './alpha-vantage.js';
import { instrumentSchema, providerInstrumentId } from '../../shared/instrument.js';

const positive = z.number().finite().positive();
const chartSchema = z.object({
  chart: z.object({
    error: z.unknown().nullable(),
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            currency: z.string(),
            exchangeName: z.string(),
            instrumentType: z.string(),
            exchangeTimezoneName: z.string(),
            regularMarketTime: z.number().int(),
            regularMarketPrice: positive,
          }),
          timestamp: z.array(z.number().int()),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(positive.nullable()) })).length(1),
            adjclose: z.array(z.object({ adjclose: z.array(positive.nullable()) })).length(1),
          }),
        }),
      )
      .nullable(),
  }),
});

export function exchangeDate(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp * 1000));
}

export function yahooSymbol(item: Instrument): string | undefined {
  if (item.yahooSymbol) return item.yahooSymbol;
  if (item.currency === 'USD' && ['NASDAQ', 'NYSE', 'US'].includes(item.exchange))
    return item.ticker;
  if (item.exchange === 'XETR') return `${item.ticker}.DE`;
  return undefined;
}

export function parseYahooSeries(
  input: unknown,
  item: Instrument,
  fxHistory: readonly FxRates[],
  now = new Date(),
): MarketSeries {
  const parsed = chartSchema.parse(input).chart;
  if (parsed.error || !parsed.result?.length)
    throw new ProviderError('coverage', 'No history for the exact listing.');
  if (parsed.result.length !== 1) throw new ProviderError('invalid', 'Ambiguous chart result.');
  const result = parsed.result[0];
  const symbol = yahooSymbol(item);
  const expectedExchange = item.mic
    ? 'CPH'
    : item.exchange === 'XETR'
      ? 'GER'
      : item.currency === 'DKK'
        ? 'CPH'
        : undefined;
  if (
    !symbol ||
    result.meta.symbol !== symbol ||
    result.meta.currency !== item.currency ||
    result.meta.instrumentType !== (item.yahooType ?? (item.kind === 'Stock' ? 'EQUITY' : 'ETF')) ||
    (expectedExchange && result.meta.exchangeName !== expectedExchange) ||
    (item.mic && result.meta.exchangeTimezoneName !== 'Europe/Copenhagen') ||
    (item.currency === 'USD' &&
      !item.mic &&
      !['NMS', 'NGM', 'NCM', 'NYQ', 'NYSE', 'NASDAQ'].includes(result.meta.exchangeName))
  )
    throw new ProviderError('invalid', 'Provider listing identity does not match.');
  const closes = result.indicators.quote[0].close,
    adjusted = result.indicators.adjclose[0].adjclose;
  if (closes.length !== result.timestamp.length || adjusted.length !== closes.length)
    throw new ProviderError('invalid', 'Incomplete history arrays.');
  const today = exchangeDate(Math.floor(now.getTime() / 1000), result.meta.exchangeTimezoneName);
  const months = new Map<string, { date: string; close: number; adjustedClose: number }>();
  let previous = '';
  result.timestamp.forEach((timestamp, i) => {
    const date = exchangeDate(timestamp, result.meta.exchangeTimezoneName);
    if (date <= previous || timestamp * 1000 > now.getTime() || date > today)
      throw new ProviderError('invalid', 'Duplicate, unordered or future history.');
    previous = date;
    // Suspensions and missing rows remain missing, never forward-filled.
    if (closes[i] === null && adjusted[i] === null) return;
    if (closes[i] === null || adjusted[i] === null)
      throw new ProviderError('invalid', 'Missing adjusted observation.');
    months.set(date.slice(0, 7), { date, close: closes[i]!, adjustedClose: adjusted[i]! });
  });
  const quoteDate = exchangeDate(result.meta.regularMarketTime, result.meta.exchangeTimezoneName);
  if (result.meta.regularMarketTime * 1000 > now.getTime() || quoteDate > today)
    throw new ProviderError('invalid', 'Future quote.');
  const fx = historicalFxForDate(fxHistory, quoteDate, item.currency);
  if (!fx) throw new ProviderError('unavailable', 'Dated quote FX is unavailable.');
  return withHistoricalFx(
    marketSchema.parse({
      instrumentId: item.id,
      currency: item.currency,
      source: 'Yahoo Finance',
      providerSymbol: symbol,
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      closeAdjustment: 'splits',
      fetchedAt: now.toISOString(),
      fxToDkk: fx.fxToDkk,
      fxDate: fx.fxDate,
      fxSource: 'ECB',
      points: [...months.values()],
      quote: { date: quoteDate, close: result.meta.regularMarketPrice },
    }),
    fxHistory,
  );
}

export async function fetchYahooSeries(
  item: Instrument,
  fxHistory: readonly FxRates[],
): Promise<MarketSeries> {
  const symbol = yahooSymbol(item);
  if (!symbol)
    throw new ProviderError('coverage', 'No verified free history mapping for this ISIN.');
  const now = new Date();
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  // Daily timestamps identify actual exchange closes. Yahoo monthly bar labels
  // are first-of-month dates and cannot be used as month-end FX observation dates.
  url.search = new URLSearchParams({
    period1: '0',
    period2: String(Math.floor(now.getTime() / 1000)),
    interval: '1d',
    events: 'div,splits',
    includeAdjustedClose: 'true',
  }).toString();
  return parseYahooSeries(await (await publicFetch(url)).json(), item, fxHistory, now);
}

export async function searchYahooListings(
  text: string,
  catalog: Instrument[],
): Promise<Instrument[]> {
  const normalized = text.trim().toLowerCase();
  const local = catalog
    .filter((item) => `${item.name} ${item.ticker} ${item.isin}`.toLowerCase().includes(normalized))
    .slice(0, 10);
  if (local.length) return local;
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.search = new URLSearchParams({ q: text, quotesCount: '10', newsCount: '0' }).toString();
  const response = z
    .object({
      quotes: z.array(
        z.object({
          symbol: z.string(),
          exchange: z.string().optional(),
          quoteType: z.string().optional(),
          shortname: z.string().optional(),
          longname: z.string().optional(),
        }),
      ),
    })
    .parse(await (await publicFetch(url)).json());
  return response.quotes.flatMap((match) => {
    if (
      match.quoteType !== 'EQUITY' ||
      !['NMS', 'NGM', 'NCM', 'NYQ'].includes(match.exchange ?? '') ||
      !/^[A-Z][A-Z0-9.-]{0,20}$/.test(match.symbol)
    )
      return [];
    const name = match.longname ?? match.shortname;
    if (!name) return [];
    const existing = catalog.find((item) => yahooSymbol(item) === match.symbol);
    return [
      existing ??
        instrumentSchema.parse({
          id: providerInstrumentId(match.symbol),
          ticker: match.symbol,
          name,
          shortName: name.slice(0, 80),
          currency: 'USD',
          kind: 'Stock',
          exchange: match.exchange === 'NYQ' ? 'NYSE' : 'NASDAQ',
          region: 'United States',
          isin: '',
          yahooSymbol: match.symbol,
          source: 'https://finance.yahoo.com/',
          sourceKind: 'provider',
          color: '#396d6c',
          description:
            'Listing metadata supplied by Yahoo Finance. Historical coverage and quote currency are verified separately.',
        }),
    ];
  });
}
