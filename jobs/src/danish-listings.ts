import { z } from 'zod';
import { instrumentSchema, type Instrument } from '../../shared/instrument.js';
import { publicFetch } from './http.js';
import reviewedSymbols from '../../shared/danish-symbols.json' with { type: 'json' };

const referenceSchema = z.object({
  isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/),
  mic: z.enum(['XCSE', 'DSME', 'FNDK']),
  gnr_full_name: z.string().min(1),
  gnr_short_name: z.string().min(1),
  gnr_cfi_code: z.string().regex(/^ES[A-Z]{4}$/),
  // Nominal share capital currency is not the Copenhagen quote currency.
  gnr_notional_curr_code: z.string().regex(/^[A-Z]{3}$/),
});
export const FIRDS_URL = 'https://registers.esma.europa.eu/solr/esma_registers_firds/select';
export const FIRDS_SOURCE = 'https://www.esma.europa.eu/data-reporting/mifir-reporting';

export function mergeDanishListings(current: Instrument[], previous: Instrument[]): Instrument[] {
  const prior = new Map(previous.map((item) => [item.id, item]));
  const merged = current.map((reference) => {
    const saved = prior.get(reference.id);
    if (!saved || saved.isin !== reference.isin)
      return { ...reference, referenceStatus: 'current' as const };
    return instrumentSchema.parse({
      ...saved,
      ...reference,
      ...(saved.yahooSymbol ? { ticker: saved.ticker, currency: saved.currency } : {}),
      ...(saved.id === 'novo'
        ? {
            name: saved.name,
            shortName: saved.shortName,
            description: saved.description,
            source: saved.source,
            sourceKind: saved.sourceKind,
          }
        : {}),
      referenceStatus: 'current',
    });
  });
  const present = new Set(current.map((item) => item.id));
  // Removing a built-in ID would make old saved ledgers/backups unreadable.
  // Keep the definition and identify it as absent from the current reference feed.
  merged.push(
    ...previous
      .filter((item) => !present.has(item.id))
      .map((item) =>
        item.kind === 'Stock' ? { ...item, referenceStatus: 'retained' as const } : item,
      ),
  );
  return merged.sort((a, b) => a.name.localeCompare(b.name, 'da'));
}

export function parseDanishReferences(input: unknown): Instrument[] {
  const rows = z.array(referenceSchema).parse(input);
  const listings = new Map<string, Instrument>();
  for (const row of rows) {
    const item = instrumentSchema.parse({
      id: row.isin === 'DK0062498333' ? 'novo' : `dk-${row.isin.toLowerCase()}`,
      name: row.gnr_full_name,
      shortName: row.gnr_full_name.slice(0, 80),
      // FIRDS contains ISINs, not exchange tickers. Do not invent a ticker.
      ticker: row.isin,
      exchange: row.mic === 'XCSE' ? 'Copenhagen' : 'First North DK',
      currency: 'DKK',
      kind: 'Stock',
      region: 'Denmark',
      description:
        'A Danish share listing identified in ESMA FIRDS. Historical price coverage is checked separately.',
      isin: row.isin,
      mic: row.mic,
      source: FIRDS_SOURCE,
      sourceKind: 'regulator',
      color: '#396d6c',
    });
    // A move between First North and Main Market must not create two holdings.
    const previous = listings.get(item.id);
    if (!previous || item.mic === 'XCSE') listings.set(item.id, item);
  }
  return [...listings.values()].sort((a, b) => a.name.localeCompare(b.name, 'da'));
}

export async function fetchDanishListings(now = new Date()): Promise<Instrument[]> {
  const day = now.toISOString().slice(0, 10);
  const cutoff = `${day}T23:59:59Z`;
  const q = [
    'type_s:parent',
    'gnr_cfi_code:ES*',
    'latest_received_flag:1',
    'never_published_flag:0',
    `valid_from_date:[* TO ${cutoff}]`,
    `-valid_to_date:[* TO ${cutoff}]`,
    `-mrkt_trdng_trmination_date:[* TO ${cutoff}]`,
  ].join(' AND ');
  const rows: unknown[] = [];
  for (const mic of ['XCSE', 'DSME', 'FNDK']) {
    let total = Infinity;
    let start = 0;
    while (start < total) {
      const url = new URL(FIRDS_URL);
      url.search = new URLSearchParams({
        q: `${q} AND mic:${mic}`,
        wt: 'json',
        rows: '250',
        start: String(start),
        fl: 'isin,mic,gnr_full_name,gnr_short_name,gnr_cfi_code,gnr_notional_curr_code',
      }).toString();
      const parsed = z
        .object({
          response: z.object({
            numFound: z.number().int().nonnegative().max(2000),
            docs: z.array(z.unknown()),
          }),
        })
        .parse(await (await publicFetch(url)).json()).response;
      if (total !== Infinity && total !== parsed.numFound)
        throw new Error('Reference catalogue changed during pagination.');
      total = parsed.numFound;
      if (!parsed.docs.length && start < total) throw new Error('Incomplete reference catalogue.');
      rows.push(...parsed.docs);
      start += parsed.docs.length;
    }
    if (start !== total) throw new Error('Incomplete reference catalogue.');
  }
  const parsed = parseDanishReferences(rows);
  if (parsed.length < 50) throw new Error('Unexpectedly incomplete Danish catalogue.');
  return parsed;
}

export function resolveDanishSymbol(input: unknown): string | undefined {
  const result = z
    .object({
      quotes: z.array(
        z.object({
          symbol: z.string(),
          exchange: z.string().optional(),
          quoteType: z.string().optional(),
        }),
      ),
    })
    .parse(input);
  // Query by exact ISIN. Ambiguous results and ADRs/other exchanges stay unmapped.
  const symbols = new Set(
    result.quotes
      .filter(
        (item) =>
          item.exchange === 'CPH' &&
          ['EQUITY', 'MUTUALFUND'].includes(item.quoteType ?? '') &&
          /^[A-Z0-9][A-Z0-9.-]*\.CO$/.test(item.symbol),
      )
      .map((item) => item.symbol),
  );
  return symbols.size === 1 ? [...symbols][0] : undefined;
}

export async function enrichDanishListing(item: Instrument): Promise<Instrument> {
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.search = new URLSearchParams({ q: item.isin, quotesCount: '10', newsCount: '0' }).toString();
  const resolved = resolveDanishSymbol(await (await publicFetch(url)).json());
  // Cross-listed shares can be absent from Copenhagen ISIN search results.
  // Reviewed mappings have issuer/exchange evidence for this exact ISIN/MIC.
  const reviewed = reviewedSymbols.listings.find(
    (row) => row.isin === item.isin && row.mic === item.mic,
  );
  const symbol = resolved ?? reviewed?.symbol ?? item.yahooSymbol;
  if (!symbol) return item;
  const chartUrl = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  chartUrl.search = new URLSearchParams({ range: '5d', interval: '1d' }).toString();
  const chart = z
    .object({
      chart: z.object({
        result: z
          .array(
            z.object({
              meta: z.object({
                symbol: z.string(),
                exchangeName: z.literal('CPH'),
                currency: z.enum(['DKK', 'EUR', 'USD']),
                instrumentType: z.enum(['EQUITY', 'MUTUALFUND']),
              }),
            }),
          )
          .length(1),
        error: z.null(),
      }),
    })
    .parse(await (await publicFetch(chartUrl)).json());
  const meta = chart.chart.result[0].meta;
  if (meta.symbol !== symbol) throw new Error('Symbol mapping identity mismatch.');
  return instrumentSchema.parse({
    ...item,
    currency: meta.currency,
    yahooSymbol: symbol,
    yahooType: meta.instrumentType,
    ticker: symbol.slice(0, -3),
    ...(reviewed && !resolved ? { symbolSource: reviewed.source } : {}),
  });
}
