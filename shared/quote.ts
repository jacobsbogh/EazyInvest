import { z } from 'zod';
import { instrumentKeySchema } from './instrument.js';
import type { Instrument } from './instrument.js';
import type { MarketSeries } from './schema.js';

export const quoteSchema = z
  .object({
    instrumentId: instrumentKeySchema,
    currency: z.enum(['EUR', 'USD', 'DKK']),
    source: z.enum(['demo', 'Twelve Data', 'Alpha Vantage', 'Yahoo Finance']),
    providerSymbol: z.string().min(1).max(40).optional(),
    fetchedAt: z.string().datetime(),
    quote: z.object({ date: z.string().date(), close: z.number().finite().positive() }).strict(),
    fxToDkk: z.number().finite().positive(),
    fxDate: z.string().date(),
    fxSource: z.literal('ECB').optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const age = Date.parse(value.quote.date) - Date.parse(value.fxDate);
    if (age < 0 || age > 7 * 86400000 || (value.currency === 'DKK' && value.fxToDkk !== 1))
      ctx.addIssue({
        code: 'custom',
        message: 'Quote conversion must use a dated reference on or before the quote.',
      });
    if (Date.parse(value.quote.date) > Date.parse(value.fetchedAt) + 86400000)
      ctx.addIssue({ code: 'custom', message: 'Quote observations cannot follow retrieval.' });
    if (
      ['Yahoo Finance', 'Alpha Vantage'].includes(value.source) &&
      (!value.providerSymbol || value.fxSource !== 'ECB')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Provider quotes require exact listing and FX provenance.',
      });
  });
export type MarketQuote = z.infer<typeof quoteSchema>;

export function quoteFromSeries(series: MarketSeries | undefined): MarketQuote | undefined {
  if (!series) return undefined;
  const point = series.quote ?? series.points.at(-1)!;
  const result = quoteSchema.safeParse({
    instrumentId: series.instrumentId,
    currency: series.currency,
    source: series.source,
    ...(series.providerSymbol ? { providerSymbol: series.providerSymbol } : {}),
    fetchedAt: series.fetchedAt,
    quote: { date: point.date, close: point.close },
    fxToDkk: series.fxToDkk,
    fxDate: series.fxDate,
    ...(series.fxSource ? { fxSource: series.fxSource } : {}),
  });
  return result.success ? result.data : undefined;
}

/** Select the entire price/FX record together, never mixing two observation dates. */
export function currentQuote(
  series: MarketSeries | undefined,
  quote?: MarketQuote,
): MarketQuote | undefined {
  return newerQuote(quoteFromSeries(series), quote);
}
export function newerQuote(
  previous?: MarketQuote,
  candidate?: MarketQuote,
): MarketQuote | undefined {
  if (!previous) return candidate;
  if (!candidate) return previous;
  return candidate.quote.date > previous.quote.date ||
    (candidate.quote.date === previous.quote.date &&
      Date.parse(candidate.fetchedAt) >= Date.parse(previous.fetchedAt))
    ? candidate
    : previous;
}
export function mergeQuotes(
  previous: Partial<Record<string, MarketQuote>>,
  incoming: MarketQuote[],
) {
  const merged = { ...previous };
  for (const quote of incoming)
    merged[quote.instrumentId] = newerQuote(merged[quote.instrumentId], quote);
  return merged;
}

export function quoteMatchesListing(quote: MarketQuote, item: Instrument) {
  return (
    quote.instrumentId === item.id &&
    quote.currency === item.currency &&
    quote.source !== 'demo' &&
    (quote.source === 'Yahoo Finance'
      ? quote.providerSymbol ===
        (item.yahooSymbol ??
          (item.exchange === 'XETR'
            ? `${item.ticker}.DE`
            : item.currency === 'USD'
              ? item.ticker
              : undefined))
      : quote.source === 'Alpha Vantage'
        ? quote.providerSymbol ===
          (item.providerSymbol ??
            (item.exchange === 'XETR'
              ? `${item.ticker}.DEX`
              : item.currency === 'DKK'
                ? `${item.ticker}.CPH`
                : item.ticker))
        : !item.providerSymbol || quote.providerSymbol === item.providerSymbol)
  );
}

export function freshQuote(quote: MarketQuote, item: Instrument, now = new Date()) {
  return (
    quoteMatchesListing(quote, item) &&
    Date.parse(quote.fetchedAt) <= now.getTime() &&
    quote.fetchedAt.slice(0, 10) === now.toISOString().slice(0, 10)
  );
}

export function quoteIsStale(quote: MarketQuote, now = Date.now()) {
  // Three calendar days allow ordinary weekends; illiquid/suspended quotes keep
  // their actual old observation date even when checked again today.
  return (
    now - Date.parse(quote.quote.date) > 3 * 86400000 ||
    now - Date.parse(quote.fetchedAt) > 3 * 86400000
  );
}
