function reviewedSnapshot(snapshot) {
  const validDate = (value) => {
    const date = new Date(value);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };
  const validText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
  if (
    !/^[a-z0-9-]+$/.test(snapshot.instrumentId) ||
    !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(snapshot.fundIsin) ||
    new URL(snapshot.source).protocol !== 'https:' ||
    !validDate(snapshot.asOf) ||
    !validDate(snapshot.checkedAt) ||
    snapshot.asOf > snapshot.checkedAt ||
    !snapshot.holdings.length ||
    snapshot.holdings.length > 10000 ||
    snapshot.holdings.some(
      (h) =>
        !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(h[0]) ||
        ![h[1], h[3], h[4]].every(validText) ||
        ![h[5], h[6]].every((value) => value === null || validText(value)) ||
        !Number.isFinite(h[2]) ||
        h[2] <= 0 ||
        h[2] > 100,
    ) ||
    new Set(snapshot.holdings.map((h) => h[0])).size !== snapshot.holdings.length ||
    snapshot.holdings.reduce((sum, h) => sum + h[2], 0) > 100.00001
  )
    throw new Error('Issuer snapshot fields or date are invalid.');
  return snapshot;
}

// Only holdings.all is portfolio inventory. Securities-lending collateral is excluded.
export function parseIsharesHoldings(data, expected) {
  if (String(data.productId) !== expected.productId || data.portfolioType !== 'ISHARES_FUND_DATA')
    throw new Error('Issuer product identity mismatch.');
  const p = data.componentsByNameMap?.holdings?.containersByNameMap?.all?.dataPointsByNameMap;
  const keys = [
    'assetClass',
    'isin',
    'issueName',
    'holdingPercent',
    'countryOfRisk',
    'sectorName',
    'ticker',
    'exchange',
  ];
  if (
    !p ||
    keys.some((k) => !Array.isArray(p[k]?.value) || p[k].value.length !== p.isin.value.length)
  )
    throw new Error('Issuer holdings columns are incomplete.');
  const rawDate = String(p.asOfDate?.value);
  if (!/^\d{8}$/.test(rawDate)) throw new Error('Issuer holdings date missing.');
  const asOf = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  const grouped = new Map();
  for (let i = 0; i < p.isin.value.length; i++) {
    if (p.assetClass.value[i] !== 'Equity') continue;
    const weight = p.holdingPercent.value[i];
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0)
      throw new Error('Invalid issuer weight.');
    if (!weight || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.isin.value[i])) continue;
    const row = [
      p.isin.value[i],
      p.issueName.value[i],
      weight,
      p.countryOfRisk.value[i],
      p.sectorName.value[i],
      p.ticker.value[i],
      p.exchange.value[i],
    ];
    const previous = grouped.get(row[0]);
    if (previous) previous[2] += weight;
    else grouped.set(row[0], row);
  }
  const holdings = [...grouped.values()].sort((a, b) => b[2] - a[2]);
  const total = holdings.reduce((s, h) => s + h[2], 0);
  if (!holdings.length || total > 100.5) throw new Error('Issuer coverage is invalid.');
  // Minor rounding above 100 is disclosed rather than producing negative unknown weight.
  const scale = total > 100 ? 100 / total : 1;
  for (const h of holdings) h[2] = Number((h[2] * scale).toFixed(8));
  return reviewedSnapshot({
    version: 1,
    instrumentId: expected.id,
    fundIsin: expected.isin,
    source: expected.source,
    asOf,
    checkedAt: new Date().toISOString().slice(0, 10),
    method: 'issuer-isin',
    reportedEquityWeight: Number(total.toFixed(8)),
    rescaled: scale !== 1,
    holdings,
  });
}

export function decodeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?38;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
export function issuerComponents(html) {
  const result = {};
  for (const m of html.matchAll(/componentprops="([^"]*)"/g)) {
    const j = JSON.parse(decodeHtml(m[1]));
    if (j.componentId) result[j.componentId] = j;
  }
  return result;
}

// Explicitly reviewed unambiguous common-share names. Alphabet/TSMC/dual classes
// are intentionally omitted: a name alone cannot distinguish share classes/ADRs.
export const sparindexAliases = {
  'NVIDIA Corp': 'NVDA',
  'Apple Inc': 'AAPL',
  'Microsoft Corp': 'MSFT',
  'Amazon.com Inc': 'AMZN',
  'Broadcom Inc': 'AVGO',
  'Meta Platforms Inc': 'META',
};
export function parseSparindexHoldings(html, expected, reference) {
  if (!html.includes(`data-isin="${expected.isin}"`))
    throw new Error('Sparindex share-class identity mismatch.');
  const start = html.indexOf('id="fond-beholdning-data"');
  const section = html.slice(start, html.indexOf('id="baeredygtighed"', start));
  const date = section.match(
    /fond-last-update">\s*Seneste opdateret:\s*(\d{1,2})\.\s*(\S+)\s*(\d{4})/,
  );
  const months = [
    'januar',
    'februar',
    'marts',
    'april',
    'maj',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'december',
  ];
  if (start < 0 || !date || !months.includes(date[2]))
    throw new Error('Sparindex holdings date missing.');
  const asOf = `${date[3]}-${String(months.indexOf(date[2]) + 1).padStart(2, '0')}-${date[1].padStart(2, '0')}`;
  const holdings = [];
  for (const row of section.split('<div class="fond-beholdning ">').slice(1)) {
    const name = decodeHtml(row.match(/mobile-only-right">([^<]+)</)?.[1] || '');
    const ticker = sparindexAliases[name];
    if (!ticker) continue;
    const weight = Number(
      row.match(/fond-beholdning-weight">[\s\S]*?<div>([\d,]+)\s*%/)?.[1]?.replace(',', '.'),
    );
    const matches = reference.holdings.filter(
      (h) => h[5] === ticker && ['NASDAQ', 'New York Stock Exchange Inc.', 'NYSE'].includes(h[6]),
    );
    if (matches.length !== 1 || !Number.isFinite(weight) || weight <= 0)
      throw new Error('Reviewed security mapping unavailable.');
    const country = decodeHtml(
      row.split('fond-beholdning-country">')[1]?.match(/<div>([^<]+)</)?.[1] || '',
    );
    const sector = decodeHtml(
      row.split('fond-beholdning-sector">')[1]?.match(/<div>([^<]+)</)?.[1] || '',
    );
    const h = matches[0];
    holdings.push([h[0], name, weight, country, sector, h[5], h[6]]);
  }
  if (holdings.length !== Object.keys(sparindexAliases).length)
    throw new Error('Reviewed Sparindex subset changed.');
  return reviewedSnapshot({
    version: 1,
    instrumentId: expected.id,
    fundIsin: expected.isin,
    source: expected.source,
    asOf,
    checkedAt: new Date().toISOString().slice(0, 10),
    method: 'reviewed-subset',
    reportedEquityWeight: null,
    rescaled: false,
    holdings,
    identitySource: reference.source,
  });
}
