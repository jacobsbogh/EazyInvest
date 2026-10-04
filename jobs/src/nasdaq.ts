import Papa from 'papaparse';
import { z } from 'zod';
import { marketSchema, type MarketSeries } from '../../shared/schema.js';
import type { Instrument } from '../../shared/instrument.js';
import { publicFetch } from './http.js';

export const NASDAQ_REPORTS = 'https://tradereports.nasdaq.com/shares/trade-reports/post-trade';
const API = 'https://tradereports.nasdaq.com/api/regulatory';
const filePattern = /^NordicEquity-posttrade-\d{4}-\d{2}-\d{2}T\d{4}$/;
type Trade = NonNullable<MarketSeries['reportedTrade']>;
type TradeEvents = { trades: Trade[]; invalidated: Set<string>; invalidatedIsins: Set<string> };
export class NasdaqReferences extends Map<string, Trade> {
  readonly invalidated = new Set<string>();
  readonly invalidatedIsins = new Set<string>();
}
const tradeKey = (mic: string, id: string) => `${mic}:${id}`;

export function selectNasdaqFiles(names: readonly string[]): string[] {
  const valid = names.filter((name) => filePattern.test(name)).sort();
  const latestDay = valid.at(-1)?.slice(23, 33);
  // A bounded sample around the Copenhagen closing session (file clock is
  // exchange local time). These are reported trades, not certified EOD closes.
  return valid.filter(
    (name) => name.slice(23, 33) === latestDay && /T(?:165[5-9]|170[0-5])$/.test(name),
  );
}

function parseNasdaqEvents(csv: string, reportFile: string, now = new Date()): TradeEvents {
  if (!filePattern.test(reportFile)) throw new Error('Invalid report filename.');
  const content = csv.replace(/^\uFEFF/, '').replace(/^"?sep=;"?\r?\n/, '');
  const events: TradeEvents = { trades: [], invalidated: new Set(), invalidatedIsins: new Set() };
  if (!content.trim()) return events;
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
  for (const row of parsed.data) {
    if (!['XCSE', 'DSME', 'FNDK'].includes(row['Venue of execution'])) continue;
    if (/\b(?:CNCL|AMND)\b/.test(row.Flags)) {
      const id = row['Transaction identification code'];
      if (!id || id.length > 100) throw new Error('Invalid cancelled transaction identity.');
      events.invalidated.add(tradeKey(row['Venue of execution'], id));
      const isin = row['Instrument identification code'];
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) events.invalidatedIsins.add(isin);
    }
  }
  for (const row of parsed.data) {
    if (
      !['XCSE', 'DSME', 'FNDK'].includes(row['Venue of execution']) ||
      row['Price currency'] !== 'DKK' ||
      row['Price notation'] !== 'MONE' ||
      row['Trading system'] !== 'CLOB' ||
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
      !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ||
      !row['Transaction identification code'] ||
      row['Transaction identification code'].length > 100
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
      transactionId: row['Transaction identification code'],
    };
    events.trades.push(trade);
  }
  return events;
}

function selectReferences(events: TradeEvents[]): NasdaqReferences {
  const references = new NasdaqReferences();
  for (const event of events) {
    for (const id of event.invalidated) references.invalidated.add(id);
    for (const isin of event.invalidatedIsins) references.invalidatedIsins.add(isin);
  }
  // Resolve invalidations across the complete bounded sample before selecting
  // a price. An amendment invalidates the old sample until a valid replacement
  // report is available; it must never leave the original trade displayed.
  for (const event of events)
    for (const trade of event.trades) {
      if (references.invalidated.has(tradeKey(trade.mic, trade.transactionId!))) continue;
      const previous = references.get(trade.isin);
      if (!previous || trade.dateTime > previous.dateTime) references.set(trade.isin, trade);
    }
  return references;
}

export function parseNasdaqTrades(
  csv: string,
  reportFile: string,
  now = new Date(),
): NasdaqReferences {
  return selectReferences([parseNasdaqEvents(csv, reportFile, now)]);
}

export async function fetchNasdaqReferences(): Promise<NasdaqReferences> {
  const response = z
    .object({ reports: z.array(z.string()).max(10000) })
    .parse(
      await (await publicFetch(`${API}/trade-reports?type=POST_TRADE&assetClass=EQUITY`)).json(),
    );
  const events: TradeEvents[] = [];
  for (const name of selectNasdaqFiles(response.reports)) {
    const url = new URL(`${API}/trade-report/download`);
    url.search = new URLSearchParams({
      type: 'POST_TRADE',
      assetClass: 'EQUITY',
      fileName: name,
    }).toString();
    events.push(parseNasdaqEvents(await (await publicFetch(url)).text(), name));
  }
  return selectReferences(events);
}

export function nasdaqTradeInvalidated(
  trade: Trade,
  references: ReadonlyMap<string, Trade>,
): boolean {
  if (!(references instanceof NasdaqReferences)) return false;
  return trade.transactionId
    ? references.invalidated.has(tradeKey(trade.mic, trade.transactionId))
    : references.invalidatedIsins.has(trade.isin);
}

export function withNasdaqReference(
  series: MarketSeries,
  item: Instrument,
  references: ReadonlyMap<string, Trade>,
): MarketSeries {
  const trade = references.get(item.isin);
  if (trade && trade.mic === item.mic)
    return marketSchema.parse({ ...series, reportedTrade: trade });
  if (series.reportedTrade && nasdaqTradeInvalidated(series.reportedTrade, references)) {
    const { reportedTrade: _invalidated, ...retained } = series;
    return marketSchema.parse(retained);
  }
  return series;
}
