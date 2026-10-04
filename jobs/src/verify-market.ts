import { mkdir, writeFile } from 'node:fs/promises';
import { danishListings, instruments } from '../../shared/catalog.js';
import { additionalFunds } from '../../shared/fund-catalog.js';
import { fetchYahooSeries } from './yahoo.js';
import { fetchEcbHistory } from './ecb.js';
import { fetchNasdaqReferences } from './nasdaq.js';
import { ProviderError } from './alpha-vantage.js';

// Read-only live probe. No Firebase login, private data or price artifacts in git.
const fx = await fetchEcbHistory();
const report: {
  checkedAt: string;
  catalogue: number;
  mapped: number;
  nasdaqSample: number;
  results: {
    id: string;
    isin: string;
    symbol?: string;
    status: string;
    observations?: number;
    first?: string;
    last?: string;
    quoteDate?: string;
    exchangeReference?: boolean;
  }[];
} = {
  checkedAt: new Date().toISOString(),
  catalogue: danishListings.length,
  mapped: danishListings.filter((item) => item.yahooSymbol).length,
  nasdaqSample: 0,
  results: [],
};
let references: ReadonlyMap<string, { isin: string }> = new Map();
try {
  references = await fetchNasdaqReferences();
  report.nasdaqSample = references.size;
} catch {
  console.warn('Nasdaq sample unavailable at verification time.');
}
const fundsOnly = process.argv.includes('--funds');
const selected = fundsOnly
  ? additionalFunds
  : process.argv.includes('--sample')
    ? danishListings.filter((item) =>
        ['NOVO-B.CO', 'DANSKE.CO', 'VWS.CO', 'MAERSK-A.CO', 'MAERSK-B.CO', 'MONSO.CO'].includes(
          item.yahooSymbol ?? '',
        ),
      )
    : [...danishListings, ...additionalFunds.filter((item) => item.kind === 'Fund')];
let failed = 0;
let throttled = false;
for (const item of selected) {
  try {
    const series = await fetchYahooSeries(item, fx);
    report.results.push({
      id: item.id,
      isin: item.isin,
      symbol: item.yahooSymbol,
      status: 'available',
      observations: series.points.length,
      first: series.points[0].date,
      last: series.points.at(-1)!.date,
      quoteDate: series.quote!.date,
      exchangeReference: references.has(item.isin),
    });
  } catch (error) {
    const reason = error instanceof ProviderError ? error.reason : 'invalid';
    report.results.push({ id: item.id, isin: item.isin, symbol: item.yahooSymbol, status: reason });
    if (reason !== 'coverage') {
      failed++;
      console.error(`${item.id}: ${reason}`);
    }
    if (reason === 'quota') {
      throttled = true;
      break;
    }
  }
  if (report.results.length % 20 === 0)
    console.log(`Verified ${report.results.length}/${selected.length} listings.`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}
// Also verify all existing ETF/US references so the entire job can run free.
for (const item of fundsOnly ? [] : instruments.filter((item) => !item.mic)) {
  if (throttled) break;
  const id = item.id;
  try {
    const series = await fetchYahooSeries(item, fx);
    console.log(
      `${id}: ${series.points.length} observations; ${series.points.filter((point) => point.fxToDkk).length} with dated DKK conversion.`,
    );
  } catch (error) {
    failed++;
    console.error(`${id}: reference verification failed.`);
    if (error instanceof ProviderError && error.reason === 'quota') throttled = true;
  }
}
await mkdir('.cache', { recursive: true });
await writeFile('.cache/market-verification.json', JSON.stringify(report, null, 2) + '\n');
const available = report.results.filter((item) => item.status === 'available').length;
console.log(
  `${available}/${selected.length} histories downloaded and validated; ${report.results.filter((item) => item.status === 'coverage').length} unavailable; ${failed} failures. Nasdaq sample: ${report.nasdaqSample} ISINs. Summary: .cache/market-verification.json`,
);
if (failed || !available) process.exitCode = 1;
