import Papa from 'papaparse';
import { z } from 'zod';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import type { Instrument } from '../../shared/instrument.js';
import { publicFetch } from './http.js';

export const NASDAQ_REPORTS = 'https://tradereports.nasdaq.com/shares/trade-reports/post-trade';
const API = 'https://tradereports.nasdaq.com/api/regulatory';
const filePattern = /^NordicEquity-posttrade-\d{4}-\d{2}-\d{2}T\d{4}$/;
type Trade = NonNullable<MarketSeries['reportedTrade']>;

export function selectNasdaqFiles(names: readonly string[]): string[] {
  const valid = names.filter((name) => filePattern.test(name)).sort();
  const latestDay = valid.at(-1)?.slice(23, 33);
  // A bounded sample around the Copenhagen closing session (file clock is
  // exchange local time). These are reported trades, not certified EOD closes.
  return valid.filter(
    (name) => name.slice(23, 33) === latestDay && /T(?:165[5-9]|170[0-5])$/.test(name),
  );
}

export function parseNasdaqTrades(
  csv: string,
  reportFile: string,
  now = new Date(),
): Map<string, Trade> {
  if (!filePattern.test(reportFile)) throw new Error('Invalid report filename.');
  const content = csv.replace(/^\uFEFF/, '').replace(/^"?sep=;"?\r?\n/, '');
  if (!content.trim()) return new Map();
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });
  const required = [
    'Trading date and time',
    'Instrument identification code',
    'Price',
    'Price currency',
    'Price notation',
    'Venue of execution',
    'Trading system',
    'Transaction identification code',
    'Flags',
  ];
  if (parsed.errors.length || required.some((field) => !parsed.meta.fields?.includes(field)))
    throw new Error('Nasdaq CSV layout changed.');
  const trades = new Map<string, Trade>();
  const cancelled = new Set(
    parsed.data
      .filter((row) => /\b(?:CNCL|AMND)\b/.test(row.Flags))
      .map((row) => row['Transaction identification code']),
  );
  for (const row of parsed.data) {
    if (
      !['XCSE', 'DSME', 'FNDK'].includes(row['Venue of execution']) ||
      row['Price currency'] !== 'DKK' ||
      row['Price notation'] !== 'MONE' ||
      row['Trading system'] !== 'CLOB' ||
      cancelled.has(row['Transaction identification code']) ||
      /\b(?:CNCL|AMND)\b/.test(row.Flags)
    )
      continue;
    const dateTime = new Date(row['Trading date and time']);
    const price = Number(row.Price),
      isin = row['Instrument identification code'];
    if (
      !Number.isFinite(dateTime.getTime()) ||
      dateTime > now ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)
    )
      throw new Error('Invalid Danish exchange trade.');
    const trade: Trade = {
      source: 'Nasdaq Nordic',
      dateTime: dateTime.toISOString(),
      close: price,
      isin,
      mic: row['Venue of execution'] as Trade['mic'],
      reportFile,
      fetchedAt: now.toISOString(),
    };
    const previous = trades.get(isin);
    if (!previous || trade.dateTime > previous.dateTime) trades.set(isin, trade);
  }
  return trades;
}

export async function fetchNasdaqReferences(): Promise<Map<string, Trade>> {
  const response = z
    .object({ reports: z.array(z.string()).max(10000) })
    .parse(
      await (await publicFetch(`${API}/trade-reports?type=POST_TRADE&assetClass=EQUITY`)).json(),
    );
  const references = new Map<string, Trade>();
  for (const name of selectNasdaqFiles(response.reports)) {
    const url = new URL(`${API}/trade-report/download`);
    url.search = new URLSearchParams({
      type: 'POST_TRADE',
      assetClass: 'EQUITY',
      fileName: name,
    }).toString();
    for (const [isin, trade] of parseNasdaqTrades(await (await publicFetch(url)).text(), name)) {
      const previous = references.get(isin);
      if (!previous || trade.dateTime > previous.dateTime) references.set(isin, trade);
    }
  }
  return references;
}

export function withNasdaqReference(
  series: MarketSeries,
  item: Instrument,
  references: ReadonlyMap<string, Trade>,
): MarketSeries {
  const trade = references.get(item.isin);
  return trade && trade.mic === item.mic
    ? marketSchema.parse({ ...series, reportedTrade: trade })
    : series;
}
