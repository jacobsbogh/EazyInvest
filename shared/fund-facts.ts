import skat from './data/skat-2026.json' with { type: 'json' };
import type { Instrument } from './instrument.js';
import type { Strategy } from './strategy.js';

export type FundCost = { percent: number; checkedAt: string; source: string };
const costs: Record<string, FundCost> = {
  IE00BK5BQT80: {
    percent: 0.14,
    checkedAt: '2026-10-04',
    source: 'https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits',
  },
  IE00B4L5Y983: {
    percent: 0.2,
    checkedAt: '2026-10-04',
    source:
      'https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund',
  },
  IE00BKM4GZ66: {
    percent: 0.18,
    checkedAt: '2026-10-04',
    source:
      'https://www.ishares.com/uk/individual/en/products/264659/ishares-msci-emerging-markets-imi-ucits-etf',
  },
  IE00B5BMR087: {
    percent: 0.07,
    checkedAt: '2026-10-04',
    source:
      'https://www.ishares.com/ch/individual/en/products/253743/ishares-sp-500-b-ucits-etf-acc-fund',
  },
};
const listed = new Set(skat.isins);
export const skatSnapshot = {
  year: skat.year,
  source: skat.source,
  publishedAt: skat.publishedAt,
  reviewedAt: skat.reviewedAt,
};
export function fundFacts(item: Instrument, year = new Date().getUTCFullYear()) {
  return {
    cost: item.kind === 'ETF' ? costs[item.isin] : undefined,
    taxStatus:
      item.kind !== 'ETF'
        ? ('not-applicable' as const)
        : !item.isin || year !== skat.year || skat.uncertainIsins.includes(item.isin)
          ? ('unknown' as const)
          : listed.has(item.isin)
            ? ('listed' as const)
            : ('not-found' as const),
  };
}
export function weightedFundCost(strategy: Strategy, catalog: Instrument[]): number | null {
  let total = 0;
  for (const a of strategy.allocations) {
    const item = catalog.find((i) => i.id === a.instrumentId);
    if (!item) return null;
    if (item.kind === 'Stock') continue;
    const cost = fundFacts(item).cost;
    if (!cost) return null;
    total += (a.weight / 100) * cost.percent;
  }
  return Number(total.toFixed(6));
}
