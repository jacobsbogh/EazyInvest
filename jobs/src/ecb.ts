import { dateSchema } from '../../shared/schema.js';

export type FxRates = { date: string; EUR: number; USD: number; DKK: number };

export function parseEcbRates(xml: string): FxRates {
  const date = dateSchema.parse(xml.match(/<Cube\s+time=['"]([^'"]+)['"]/u)?.[1]);
  if (date > new Date().toISOString().slice(0, 10)) throw new Error('Future FX observation.');
  const rates = new Map(
    [...xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]+)['"]/gu)].map(
      (match) => [match[1], Number(match[2])],
    ),
  );
  const dkk = rates.get('DKK');
  const usd = rates.get('USD');
  if (!dkk || !usd || !Number.isFinite(dkk) || !Number.isFinite(usd) || dkk <= 0 || usd <= 0)
    throw new Error('Missing or invalid ECB reference rates.');
  return { date, EUR: dkk, USD: dkk / usd, DKK: 1 };
}

export async function fetchEcbRates() {
  const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('ECB reference rates are unavailable.');
  return parseEcbRates(await response.text());
}
