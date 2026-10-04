import { writeFile, mkdir, rename } from 'node:fs/promises';
import sources from '../shared/data/holdings-sources.json' with { type: 'json' };
import {
  issuerComponents,
  parseIsharesHoldings,
  parseSparindexHoldings,
} from './holdings-parser.mjs';
const output = new URL('../shared/data/holdings/', import.meta.url);
await mkdir(output, { recursive: true });
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error(`Public issuer request failed: HTTP ${response.status}. No retry.`);
  return response.text();
}
const snapshots = [];
for (const expected of sources) {
  const html = await request(expected.source);
  let snapshot;
  if (expected.kind === 'ishares') {
    const components = issuerComponents(html);
    const facts = components.keyFundFacts?.containersByNameMap?.default?.dataPointsByNameMap;
    if (!facts || !Object.values(facts).some((f) => f.value === expected.isin))
      throw new Error('Exact fund ISIN not found on issuer page.');
    const date = components.holdings?.initAsOfDates?.all;
    if (!/^\d{8}$/.test(String(date))) throw new Error('Issuer holdings date missing.');
    const url = new URL(
      'https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data',
    );
    url.search = new URLSearchParams({
      appSubType: 'ISHARES',
      appType: 'PRODUCT_PAGE',
      component: 'holdings.all',
      locale: 'en_GB',
      portfolioId: expected.productId,
      targetSite: 'ishares-uk',
      userType: 'individual',
      excludeContent: 'true',
      asOfDate: String(date),
      includeConfig: 'true',
    }).toString();
    snapshot = parseIsharesHoldings(JSON.parse(await request(url)), expected);
    if (snapshot.asOf.replaceAll('-', '') !== String(date))
      throw new Error('Issuer response date differs from the requested holdings date.');
    snapshot.downloadSource = url.href;
  } else {
    snapshot = parseSparindexHoldings(
      html,
      expected,
      snapshots.find((s) => s.instrumentId === 'eunl'),
    );
  }
  snapshots.push(snapshot);
  console.log(
    JSON.stringify({
      id: snapshot.instrumentId,
      asOf: snapshot.asOf,
      rows: snapshot.holdings.length,
      matchedWeight: snapshot.holdings.reduce((s, h) => s + h[2], 0),
      method: snapshot.method,
    }),
  );
}
// Validate every response before replacing any committed snapshot.
for (const s of snapshots) {
  if (!/^[a-z0-9-]+$/.test(s.instrumentId)) throw new Error('Invalid snapshot path.');
  const target = new URL(`${s.instrumentId}.json`, output),
    temp = new URL(`${s.instrumentId}.json.tmp`, output);
  await writeFile(temp, JSON.stringify(s, null, 2) + '\n');
  await rename(temp, target);
}
