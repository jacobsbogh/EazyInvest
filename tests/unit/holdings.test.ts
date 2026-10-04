import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  holdingsSchema,
  securityOverlap,
  strategyExposure,
  type HoldingsSnapshot,
} from '../../shared/holdings';
import { getInstrument, instruments } from '../../shared/catalog';
import { parseIsharesHoldings } from '../../scripts/holdings-parser.mjs';
const row = (isin: string, weight: number) => [
  isin,
  isin,
  weight,
  'United States',
  'Information Technology',
  'X',
  'NASDAQ',
];
const fixture = (id: string, holdings: unknown[]): HoldingsSnapshot =>
  holdingsSchema.parse({
    version: 1,
    instrumentId: id,
    fundIsin: getInstrument(id).isin,
    source: 'https://example.com/issuer',
    asOf: '2026-09-30',
    checkedAt: '2026-10-04',
    method: 'issuer-isin',
    reportedEquityWeight: 100,
    rescaled: false,
    holdings,
  });
const first = fixture('eunl', [row('US5949181045', 40), row('US0378331005', 60)]);
const second = fixture('sxr8', [row('US5949181045', 20), row('US67066G1040', 80)]);
const exposure = (id: string, snapshots = [first, second]) =>
  strategyExposure([{ instrumentId: id, weight: 100 }], instruments, snapshots);
describe('dated exact-security holdings exposure', () => {
  it('computes shared security weight rather than counting matching names', () => {
    const p = securityOverlap(exposure('eunl'), exposure('sxr8'));
    expect(p.observed).toBe(20);
    expect(p.upper).toBe(20);
    expect(p.shared).toHaveLength(1);
  });
  it('preserves partial coverage and an overlap upper bound', () => {
    const partial = fixture('eunl', [row('US5949181045', 40)]);
    const p = securityOverlap(
      exposure('eunl', [partial, second]),
      exposure('sxr8', [partial, second]),
    );
    expect(p.observed).toBe(20);
    expect(p.upper).toBe(80);
    expect(exposure('vwce').unknown).toBe(100);
    expect(securityOverlap(exposure('vwce'), exposure('sxr8')).upper).toBe(100);
  });
  it('weights securities by strategy allocation without normalizing away unknown funds', () => {
    const p = strategyExposure(
      [
        { instrumentId: 'eunl', weight: 50 },
        { instrumentId: 'sxr8', weight: 25 },
        { instrumentId: 'vwce', weight: 25 },
      ],
      instruments,
      [first, second],
    );
    expect(p.holdings.get('US5949181045')?.weight).toBe(25);
    expect(p.covered).toBe(75);
    expect(p.unknown).toBe(25);
  });
  it('detects direct shares already contained in a fund', () => {
    const p = securityOverlap(exposure('msft'), exposure('eunl'));
    expect(p.observed).toBe(40);
    expect(p.upper).toBe(40);
  });
  it('uses unambiguous ticker and venue identities with source provenance, never names alone', () => {
    const catalog = instruments.map((i) => (i.id === 'msft' ? { ...i, isin: '' } : i));
    const reference = fixture('eunl', [
      ['US5949181045', 'Microsoft common shares', 40, 'United States', 'IT', 'MSFT', 'NASDAQ'],
    ]);
    const resolve = (sources: HoldingsSnapshot[]) =>
      strategyExposure([{ instrumentId: 'msft', weight: 100 }], catalog, sources);
    expect(resolve([reference]).covered).toBe(100);
    expect(resolve([reference]).sources[0].source).toBe(reference.source);
    expect(resolve([fixture('eunl', [row('US5949181045', 40)])]).covered).toBe(0);
    const ambiguous = fixture('sxr8', [
      ['US0378331005', 'Another class', 40, 'United States', 'IT', 'MSFT', 'NASDAQ'],
    ]);
    expect(resolve([reference, ambiguous]).covered).toBe(0);
  });
  it('rejects malformed totals, duplicate securities and mismatched fund ISINs', () => {
    expect(() => fixture('eunl', [row('US5949181045', 101)])).toThrow();
    expect(() => fixture('eunl', [row('US5949181045', 50), row('US5949181045', 50)])).toThrow();
    expect(exposure('eunl', [{ ...first, fundIsin: second.fundIsin }]).covered).toBe(0);
    expect(() =>
      strategyExposure(
        [
          { instrumentId: 'eunl', weight: 50 },
          { instrumentId: 'eunl', weight: 50 },
        ],
        instruments,
        [first],
      ),
    ).toThrow();
  });
  it('validates every reviewed snapshot and contains no price fields', () => {
    const path = new URL('../../shared/data/holdings/', import.meta.url);
    for (const file of readdirSync(path).filter((f) => f.endsWith('.json'))) {
      const raw = readFileSync(new URL(file, path), 'utf8'),
        parsed = holdingsSchema.parse(JSON.parse(raw));
      expect(parsed.fundIsin).toBe(getInstrument(parsed.instrumentId).isin);
      expect(raw).not.toMatch(/unitPrice|marketValue|unitsHeld|password|token/);
    }
  });
  it('parses only holdings.all, combines identical securities and rejects malformed source fields', () => {
    const fields = {
      asOfDate: { value: 20261002 },
      ...Object.fromEntries(
        [
          'assetClass',
          'isin',
          'issueName',
          'holdingPercent',
          'countryOfRisk',
          'sectorName',
          'ticker',
          'exchange',
        ].map((k, i) => [
          k,
          {
            value: [
              ['Equity', 'Cash'],
              ['US5949181045', '-'],
              ['Microsoft', 'Cash'],
              [99.5, 0.5],
              ['United States', 'United States'],
              ['IT', 'Cash'],
              ['MSFT', 'USD'],
              ['NASDAQ', '-'],
            ][i],
          },
        ]),
      ),
    };
    const expected = {
      id: 'eunl',
      isin: first.fundIsin,
      productId: '251882',
      source: first.source,
    };
    const data = {
      productId: 251882,
      portfolioType: 'ISHARES_FUND_DATA',
      componentsByNameMap: {
        holdings: { containersByNameMap: { all: { dataPointsByNameMap: fields } } },
        secLending: {},
      },
    };
    expect(parseIsharesHoldings(data, expected).holdings).toHaveLength(1);
    expect(() => parseIsharesHoldings({ ...data, productId: 123 }, expected)).toThrow();
    expect(() =>
      parseIsharesHoldings({ ...data, componentsByNameMap: { secLending: {} } }, expected),
    ).toThrow();
    for (const field of Object.values(fields)) {
      if (Array.isArray(field.value)) field.value.push(field.value[0]);
    }
    fields.holdingPercent.value[0] = 40;
    fields.holdingPercent.value[2] = 59.5;
    const combined = parseIsharesHoldings(data, expected);
    expect(combined.holdings).toHaveLength(1);
    expect(combined.holdings[0][2]).toBe(99.5);
    fields.countryOfRisk.value[0] = '';
    expect(() => parseIsharesHoldings(data, expected)).toThrow();
    fields.countryOfRisk.value[0] = 'United States';
    fields.asOfDate.value = 20260230;
    expect(() => parseIsharesHoldings(data, expected)).toThrow();
  });
});
