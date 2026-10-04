import { describe, expect, it } from 'vitest';
import { instruments, getInstrument } from '../../shared/catalog';
import { additionalFunds } from '../../shared/fund-catalog';
import { fundFacts, weightedFundCost, strategyTaxIssue } from '../../shared/fund-facts';
import { instrumentSchema } from '../../shared/instrument';
import { parseWorkspace } from '../../shared/schema';
import { emptyWorkspace } from '../../src/lib/demo';
import { mergeDanishListings } from '../../jobs/src/danish-listings';
import { parseYahooSeries } from '../../jobs/src/yahoo';
import { historicalObservations } from '../../shared/historical-series';
import type { Strategy } from '../../shared/strategy';

const strategy = (id: string, account: Strategy['account'] = 'none'): Strategy => ({
  id: 'fund-plan',
  name: 'Fund comparison',
  allocations: [{ instrumentId: id, weight: 100 }],
  initial: 1000,
  monthly: 100,
  goal: 100000,
  account,
  rebalance: 'none',
  note: '',
  startMonth: null,
  endMonth: null,
});
describe('reviewed Danish index funds and UCITS share classes', () => {
  it('keeps Copenhagen funds separate from ordinary shares and uses EUR ETF trading listings', () => {
    expect(additionalFunds).toHaveLength(8);
    expect(additionalFunds.filter((item) => item.kind === 'Fund')).toHaveLength(4);
    expect(new Set(instruments.map((item) => item.id)).size).toBe(instruments.length);
    expect(new Set(additionalFunds.map((item) => item.isin)).size).toBe(8);
    for (const item of additionalFunds) {
      expect(instrumentSchema.safeParse(item).success).toBe(true);
      expect(item.sourceKind).toBe('issuer');
      expect(item.currency).toBe(item.kind === 'Fund' ? 'DKK' : 'EUR');
    }
  });
  it('matches exact share-class charges and distinguishes transaction and entry/exit costs', () => {
    const expected = {
      'sparindex-global': 0.5,
      'sparindex-emerging': 0.5,
      'danske-global': 0.4,
      'nordea-global': 0.35,
      spyi: 0.17,
      sppw: 0.12,
      eunk: 0.12,
      iusn: 0.35,
    };
    for (const [id, percent] of Object.entries(expected))
      expect(fundFacts(getInstrument(id), 2026).cost?.percent).toBe(percent);
    expect(fundFacts(getInstrument('sparindex-global'), 2026)).toMatchObject({
      transactionCost: { percent: 0.05 },
      entryCost: { percent: 0.12 },
      exitCost: { percent: 0.07 },
      incomeTreatment: 'distributing',
    });
    const mix = {
      ...strategy('sparindex-global'),
      allocations: [
        { instrumentId: 'sparindex-global', weight: 60 },
        { instrumentId: 'eunl', weight: 40 },
      ],
    };
    expect(weightedFundCost(mix, instruments)).toBeCloseTo(0.38);
    expect(
      fundFacts({ ...getInstrument('sparindex-global'), isin: 'DK0060748556' }, 2026).cost,
    ).toBeUndefined();
  });
  it('uses issuer tax classifications independently of membership in the investment-company list', () => {
    for (const item of additionalFunds.filter((item) => item.kind === 'Fund')) {
      expect(fundFacts(item, 2026)).toMatchObject({
        taxStatus: 'not-found',
        taxTreatment: { kind: 'equity-realisation-distributions', year: 2026 },
      });
      expect(fundFacts(item, 2027).taxTreatment.kind).toBe('unknown');
    }
    for (const item of additionalFunds.filter((item) => item.kind === 'ETF')) {
      expect(fundFacts(item, 2026)).toMatchObject({
        taxStatus: 'listed',
        taxTreatment: { kind: 'equity-annual', year: 2026 },
      });
      expect(fundFacts(item, 2027).taxTreatment.kind).toBe('unknown');
    }
  });
  it('prevents a planner handoff that silently treats fund distributions as deferred sale gains', () => {
    expect(strategyTaxIssue(strategy('sparindex-global', 'general'), instruments, 2026)).toContain(
      'distribution tax',
    );
    expect(strategyTaxIssue(strategy('sparindex-global', 'annual'), instruments, 2026)).toContain(
      'distribution tax',
    );
    expect(strategyTaxIssue(strategy('sparindex-global'), instruments, 2026)).toBeNull();
    expect(strategyTaxIssue(strategy('spyi', 'general'), instruments, 2026)).toContain(
      'annual taxation',
    );
    expect(strategyTaxIssue(strategy('spyi', 'annual'), instruments, 2026)).toBeNull();
    expect(strategyTaxIssue(strategy('spyi', 'annual'), instruments, 2027)).toContain('unverified');
  });
  it('retains fund identities and saved strategies when refreshing the ordinary-share reference universe', () => {
    const fund = getInstrument('sparindex-global');
    expect(
      mergeDanishListings([getInstrument('novo')], [getInstrument('novo'), fund]).find(
        (i) => i.id === fund.id,
      ),
    ).toEqual(fund);
    const workspace = {
      ...emptyWorkspace(),
      strategies: [strategy(fund.id)],
      preferredStrategyId: 'fund-plan',
      transactions: [
        {
          id: 'fund-buy',
          instrumentId: fund.id,
          type: 'buy',
          date: '2026-01-02',
          quantity: 5,
          price: 100,
          fx: 1,
          fees: 0,
          note: '',
        },
      ],
    };
    expect(parseWorkspace(JSON.parse(JSON.stringify(workspace)))).toEqual(workspace);
  });
  it('accepts an issuer-verified fund despite the price provider classifying its units as equities', () => {
    const timestamp = (date: string) => Date.parse(date) / 1000;
    const chart = {
      chart: {
        error: null,
        result: [
          {
            meta: {
              symbol: 'SPVIGAKL.CO',
              currency: 'DKK',
              exchangeName: 'CPH',
              instrumentType: 'EQUITY',
              exchangeTimezoneName: 'Europe/Copenhagen',
              regularMarketTime: timestamp('2026-02-27T16:00:00Z'),
              regularMarketPrice: 110,
            },
            timestamp: [timestamp('2026-01-30T08:00:00Z'), timestamp('2026-02-27T08:00:00Z')],
            indicators: { quote: [{ close: [100, 110] }], adjclose: [{ adjclose: [90, 110] }] },
          },
        ],
      },
    };
    const item = getInstrument('sparindex-global');
    const series = parseYahooSeries(chart, item, [], new Date('2026-03-01T12:00:00Z'));
    expect(historicalObservations(series, 'DKK').points).toEqual([
      { date: '2026-01-30', value: 90 },
      { date: '2026-02-27', value: 110 },
    ]);
    expect(() =>
      parseYahooSeries(chart, { ...item, currency: 'EUR' }, [], new Date('2026-03-01')),
    ).toThrow('identity');
  });
});
