import { z } from 'zod';
import type { Instrument } from '../../shared/catalog.js';
import { dateSchema, marketSchema } from '../../shared/schema.js';
import type { MarketSeries } from '../../shared/schema.js';

const positiveString = z.string().transform(Number).pipe(z.number().finite().positive());
const responseSchema = z.object({
  meta: z.object({ currency: z.string().optional(), symbol: z.string() }),
  values: z
    .array(z.object({ datetime: dateSchema, close: positiveString }))
    .min(1)
    .max(6000),
});
export function parsePriceResponse(input: unknown, instrument: Instrument) {
  const response = responseSchema.parse(input);
  if (response.meta.currency !== instrument.currency)
    throw new Error('Provider currency does not match the instrument.');
  if (
    response.meta.symbol.replace(/[-\s]/g, '').toUpperCase() !==
    instrument.ticker.replace(/[-\s]/g, '').toUpperCase()
  )
    throw new Error('Provider symbol does not match the instrument.');
  const points = response.values
    .map((row) => ({ date: row.datetime, close: row.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(points.map((p) => p.date)).size !== points.length)
    throw new Error('Provider returned duplicate dates.');
  return points;
}
export async function fetchSeries(
  instrument: Instrument,
  apiKey: string,
  consumeCredit: () => Promise<void>,
): Promise<MarketSeries> {
  async function request(parameters: Record<string, string>): Promise<unknown> {
    await consumeCredit();
    const url = new URL('https://api.twelvedata.com/time_series');
    url.search = new URLSearchParams({
      ...parameters,
      interval: '1day',
      apikey: apiKey,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Market data provider is unavailable.');
    return response.json();
  }
  const raw = await request({
    symbol: instrument.ticker,
    exchange: instrument.exchange,
    outputsize: '1260',
    order: 'ASC',
  });
  const points = parsePriceResponse(raw, instrument);
  let fxToDkk = 1;
  let fxDate = points.at(-1)!.date;
  if (instrument.currency !== 'DKK') {
    const fx = responseSchema.parse(
      await request({ symbol: `${instrument.currency}/DKK`, outputsize: '1' }),
    );
    if (fx.meta.symbol !== `${instrument.currency}/DKK`)
      throw new Error('Provider returned an unexpected FX pair.');
    fxToDkk = fx.values[0].close;
    fxDate = fx.values[0].datetime;
  }
  return marketSchema.parse({
    instrumentId: instrument.id,
    currency: instrument.currency,
    source: 'Twelve Data',
    fetchedAt: new Date().toISOString(),
    fxToDkk,
    fxDate,
    points,
  });
}
