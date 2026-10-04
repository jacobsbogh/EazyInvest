import { z } from 'zod';
import type { Instrument } from '../../shared/catalog.js';
import { dateSchema, marketSchema } from '../../shared/schema.js';
import type { FxRates } from './ecb.js';
import { listingSymbol } from './listings.js';

const positiveString = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().finite().positive());
const candidates = {
  vwce: { symbol: 'VWCE.DEX', region: 'Germany', words: ['VANGUARD', 'ALL', 'WORLD'] },
  eunl: { symbol: 'EUNL.DEX', region: 'Germany', words: ['ISHARES', 'MSCI', 'WORLD'] },
  is3n: { symbol: 'IS3N.DEX', region: 'Germany', words: ['ISHARES', 'MSCI', 'EM'] },
  sxr8: { symbol: 'SXR8.DEX', region: 'Germany', words: ['ISHARES', '500'] },
  novo: { symbol: 'NOVO-B.CPH', region: 'Denmark', words: ['NOVO', 'NORDISK'] },
  msft: { symbol: 'MSFT', region: 'United States', words: ['MICROSOFT'] },
} as const;

export class ProviderError extends Error {
  constructor(public readonly reason: 'coverage' | 'quota' | 'invalid' | 'unavailable') {
    super(`Provider request failed: ${reason}.`);
  }
}

export function validateListing(input: unknown, instrument: Instrument) {
  const symbol = listingSymbol(instrument);
  if (!symbol) throw new ProviderError('coverage');
  const candidate = Object.hasOwn(candidates, instrument.id)
    ? candidates[instrument.id as keyof typeof candidates]
    : {
        symbol,
        region:
          instrument.currency === 'USD'
            ? 'United States'
            : instrument.currency === 'DKK'
              ? 'Denmark'
              : 'Germany',
        words: [instrument.name.toUpperCase().match(/[A-Z0-9]+/)?.[0] ?? instrument.ticker],
      };
  const response = z
    .object({
      bestMatches: z.array(
        z.object({
          '1. symbol': z.string(),
          '2. name': z.string(),
          '3. type': z.string(),
          '4. region': z.string(),
          '8. currency': z.string(),
        }),
      ),
    })
    .parse(input);
  const listing = response.bestMatches.find((match) => match['1. symbol'] === candidate.symbol);
  if (!listing) throw new ProviderError('coverage');
  const name = listing['2. name'].toUpperCase();
  // Search labels German venues as XETRA/Frankfurt rather than consistently
  // using country names. The documented .DEX suffix must still match exactly.
  const region = listing['4. region'].replace(/[^A-Za-z]/gu, '').toUpperCase();
  const regions =
    candidate.region === 'Germany'
      ? ['GERMANY', 'XETRA', 'GERMANYXETRA']
      : [candidate.region.replace(/[^A-Za-z]/gu, '').toUpperCase()];
  if (
    !regions.includes(region) ||
    listing['8. currency'] !== instrument.currency ||
    listing['3. type'] !== (instrument.kind === 'ETF' ? 'ETF' : 'Equity') ||
    !candidate.words.every((word) => name.includes(word))
  )
    throw new ProviderError('invalid');
  return candidate.symbol;
}

export function parseMonthlyHistory(input: unknown, symbol: string) {
  const response = z
    .object({
      'Meta Data': z.object({ '2. Symbol': z.literal(symbol) }),
      'Monthly Adjusted Time Series': z.record(
        dateSchema,
        z.object({
          '4. close': positiveString,
          '5. adjusted close': positiveString,
        }),
      ),
    })
    .parse(input);
  const points = Object.entries(response['Monthly Adjusted Time Series'])
    .map(([date, row]) => ({
      date,
      close: row['4. close'],
      adjustedClose: row['5. adjusted close'],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  if (
    !points.length ||
    points.length > 1200 ||
    points.some((point) => point.date > today) ||
    new Set(points.map((point) => point.date.slice(0, 7))).size !== points.length
  )
    throw new ProviderError('invalid');
  return points;
}

export function parseLatestQuote(input: unknown, symbol: string) {
  const response = z
    .object({
      'Global Quote': z.object({
        '01. symbol': z.literal(symbol),
        '05. price': positiveString,
        '07. latest trading day': dateSchema,
      }),
    })
    .parse(input);
  const row = response['Global Quote'];
  if (row['07. latest trading day'] > new Date().toISOString().slice(0, 10))
    throw new ProviderError('invalid');
  return { date: row['07. latest trading day'], close: row['05. price'] };
}

export async function fetchAlphaSeries(
  instrument: Instrument,
  apiKey: string,
  fx: FxRates,
  consumeCredit: () => Promise<void>,
) {
  if (apiKey === 'demo') throw new ProviderError('invalid');
  async function request(parameters: Record<string, string>): Promise<unknown> {
    await consumeCredit();
    const url = new URL('https://www.alphavantage.co/query');
    url.search = new URLSearchParams({ ...parameters, apikey: apiKey }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new ProviderError('unavailable');
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      if ('Information' in body || 'Note' in body) {
        const message = 'Information' in body ? body.Information : 'Note' in body ? body.Note : '';
        throw new ProviderError(
          typeof message === 'string' &&
            /premium|subscribe|subscription/iu.test(message) &&
            !/rate limit|call frequency|requests per|requests\/day|reached.{0,20}limit/iu.test(
              message,
            )
            ? 'coverage'
            : 'quota',
        );
      }
      if ('Error Message' in body) throw new ProviderError('coverage');
    }
    return body;
  }
  const symbol = validateListing(
    await request({
      function: 'SYMBOL_SEARCH',
      keywords: instrument.ticker === 'NOVO B' ? 'NOVO' : instrument.ticker,
    }),
    instrument,
  );
  const points = parseMonthlyHistory(
    await request({ function: 'TIME_SERIES_MONTHLY_ADJUSTED', symbol }),
    symbol,
  );
  const quote = parseLatestQuote(await request({ function: 'GLOBAL_QUOTE', symbol }), symbol);
  return marketSchema.parse({
    instrumentId: instrument.id,
    currency: instrument.currency,
    source: 'Alpha Vantage',
    providerSymbol: symbol,
    frequency: 'monthly',
    adjustment: 'splits-and-dividends',
    fetchedAt: new Date().toISOString(),
    fxToDkk: fx[instrument.currency],
    fxDate: fx.date,
    fxSource: 'ECB',
    points,
    quote,
  });
}
