import { z } from 'zod';
import { instruments, type Instrument } from '../../shared/catalog.js';
import { instrumentSchema, providerInstrumentId } from '../../shared/instrument.js';

const referenceSymbols: Record<string, string> = {
  vwce: 'VWCE.DEX',
  eunl: 'EUNL.DEX',
  is3n: 'IS3N.DEX',
  sxr8: 'SXR8.DEX',
  novo: 'NOVO-B.CPH',
  msft: 'MSFT',
};
export function listingSymbol(item: Instrument) {
  return referenceSymbols[item.id] ?? item.providerSymbol;
}
export const searchResponseSchema = z.object({
  bestMatches: z
    .array(
      z.object({
        '1. symbol': z.string(),
        '2. name': z.string(),
        '3. type': z.string(),
        '4. region': z.string(),
        '8. currency': z.string(),
      }),
    )
    .max(50),
});
export function parseSearchResults(input: unknown): Instrument[] {
  const response = searchResponseSchema.parse(input);
  const results: Instrument[] = [];
  for (const match of response.bestMatches) {
    const symbol = match['1. symbol'];
    const region = match['4. region'].replace(/[^A-Za-z]/gu, '').toUpperCase();
    const currency = match['8. currency'];
    let exchange: string;
    let country: string;
    if (region === 'UNITEDSTATES' && currency === 'USD' && /^[A-Z][A-Z0-9-]*$/.test(symbol)) {
      exchange = 'US';
      country = 'United States';
    } else if (
      ['GERMANY', 'XETRA', 'GERMANYXETRA'].includes(region) &&
      currency === 'EUR' &&
      symbol.endsWith('.DEX')
    ) {
      exchange = 'XETR';
      country = 'Germany';
    } else if (region === 'DENMARK' && currency === 'DKK' && symbol.endsWith('.CPH')) {
      exchange = 'OMXC';
      country = 'Denmark';
    } else continue;
    if (!['ETF', 'Equity'].includes(match['3. type'])) continue;
    const kind = match['3. type'] === 'ETF' ? 'ETF' : 'Stock';
    const reference = instruments.find((item) => listingSymbol(item) === symbol);
    if (reference && (reference.currency !== currency || reference.kind !== kind)) continue;
    const parsed = instrumentSchema.safeParse(
      reference ?? {
        id: providerInstrumentId(symbol),
        name: match['2. name'],
        shortName: match['2. name'].slice(0, 80),
        ticker: symbol.replace(/\.(DEX|CPH)$/, ''),
        exchange,
        currency,
        kind,
        region: country,
        description:
          'Listing metadata supplied by Alpha Vantage. Verify the issuer, share class and fund documentation before investing.',
        isin: '',
        source: 'https://www.alphavantage.co/documentation/#symbolsearch',
        sourceKind: 'provider',
        providerSymbol: symbol,
        color: '#396d6c',
      },
    );
    if (parsed.success && !results.some((item) => item.id === parsed.data.id))
      results.push(parsed.data);
  }
  return results.slice(0, 10);
}
