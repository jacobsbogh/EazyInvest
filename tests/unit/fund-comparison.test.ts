import { describe, expect, it } from 'vitest';
import {
  calculateFundScenario,
  comparisonModel,
  fundScenarioSchema,
  type FundScenario,
  type FundModel,
} from '../../shared/fund-comparison';
import { getInstrument } from '../../shared/catalog';

const scenario: FundScenario = {
  initial: 100000,
  monthly: 0,
  years: 1,
  returnRate: 10,
  account: 'ordinary',
  married: false,
  otherIncome: 0,
  reinvest: true,
  includeTransactionCosts: false,
  includeEntryExitCosts: false,
};
const fund: FundModel = {
  ongoing: 0,
  transaction: 0,
  entry: 0,
  exit: 0,
  distributionYield: 5,
  treatment: 'realisation',
};
const run = (s: Partial<FundScenario> = {}, f: Partial<FundModel> = {}) =>
  calculateFundScenario({ ...scenario, ...s }, { ...fund, ...f });

describe('independent annual fund cash flows', () => {
  it('splits total return once and increases acquisition cost with net reinvestment', () => {
    const p = run()[0];
    // 110,000 before payout; 5,500 distribution, 1,485 tax, 4,015 reinvestment.
    expect(p.distribution).toBeCloseTo(5500, 6);
    expect(p.distributionTax).toBeCloseTo(1485, 6);
    expect(p.fund).toBeCloseTo(108515, 6);
    expect(p.basis).toBeCloseTo(104015, 6);
    expect(p.saleTax).toBeCloseTo(1215, 6);
    expect(p.afterSale).toBeCloseTo(107300, 6);
  });
  it('keeps net distributions as zero-interest cash when reinvestment is disabled', () => {
    const p = run({ reinvest: false })[0];
    expect(p.fund).toBeCloseTo(104500, 6);
    expect(p.cash).toBeCloseTo(4015, 6);
    expect(p.basis).toBe(100000);
    expect(p.afterSale).toBeCloseTo(107300, 6);
    const later = run({ reinvest: false, years: 2 })[1];
    expect(later.distribution).toBeCloseTo(5747.5, 6);
    expect(later.fund).toBeCloseTo(109202.5, 6);
    expect(later.cash).toBeCloseTo(8210.675, 6);
    expect(later.afterSale).toBeCloseTo(114928.5, 6);
  });
  it('does not charge hypothetical year-one sale tax against future holdings', () => {
    const p = run({ years: 2 })[1];
    expect(p.fund).toBeCloseTo(117755.05225, 6);
    expect(p.basis).toBeCloseTo(108371.87725, 6);
    expect(p.saleTax).toBeCloseTo(2533.45725, 6);
  });
  it('shares progressive bands between distributions, sale gains and other income', () => {
    const p = run({ initial: 1000000 })[0];
    // Total share income 100,000: 79,400*27% + 20,600*42%.
    expect(p.distributionTax + p.saleTax).toBeCloseTo(30090, 6);
    expect(run({ initial: 1000000, married: true })[0].afterSale).toBeCloseTo(1073000, 6);
    expect(
      run({ otherIncome: 79000 })[0].distributionTax + run({ otherIncome: 79000 })[0].saleTax,
    ).toBeCloseTo(4140, 6);
  });
  it('refunds only current-year distribution tax on a terminal loss', () => {
    const p = run({ returnRate: -10 })[0];
    expect(p.distribution).toBeCloseTo(4500, 6);
    expect(p.saleTax).toBeCloseTo(-1215, 6);
    expect(p.taxPaid + p.saleTax).toBeCloseTo(0, 6);
    expect(p.afterSale).toBeCloseTo(90000, 6);
    expect(p.lossCarry).toBeCloseTo(10000, 6);
  });
  it('taxes the full annual total return exactly once for an equity investment company', () => {
    const p = run({}, { treatment: 'annual' })[0];
    expect(p.annualTax).toBeCloseTo(2700, 6);
    expect(p.distributionTax).toBe(0);
    expect(p.saleTax).toBe(0);
    expect(p.afterSale).toBeCloseTo(107300, 6);
    expect(run({ reinvest: false }, { treatment: 'annual' })[0].afterSale).toBeCloseTo(107300, 6);
  });
  it('retains losses without inventing an immediate tax refund', () => {
    const p = run({ returnRate: -10, years: 2 }, { treatment: 'annual', distributionYield: 0 });
    expect(p[0].taxPaid).toBe(0);
    expect(p[1].taxPaid).toBe(0);
    expect(p[1].lossCarry).toBeCloseTo(19000, 6);
  });
  it('accepts only ASK room and includes inside cash in the next opening value', () => {
    const p = run({ initial: 200000, monthly: 1000, years: 2, account: 'ask', reinvest: false });
    expect(p[0].accepted).toBe(174200);
    expect(p[0].outsideCash).toBe(37800);
    expect(p[0].annualTax).toBeCloseTo(2961.4, 6);
    expect(p[0].cash).toBeCloseTo(6619.6, 6);
    expect(p[1].accepted).toBe(174200);
    expect(p[1].outsideCash).toBe(49800);
    expect(p[1].contributed).toBe(224000);
    expect(run({ account: 'ask' }, { distributionYield: 0 })[0].wealth).toBeCloseTo(
      run({ account: 'ask' })[0].wealth,
      6,
    );
  });
  it('uses carried annual losses before taxing a later gain', () => {
    // A 10% initial purchase charge creates a 5,500 first-year loss at 5% return.
    // Year two gains 4,725; year three gains 4,961.25, of which 4,186.25 is taxable.
    const p = run(
      { returnRate: 5, years: 3 },
      { entry: 10, distributionYield: 0, treatment: 'annual' },
    );
    expect(p[0].lossCarry).toBeCloseTo(5500, 6);
    expect(p[1].lossCarry).toBeCloseTo(775, 6);
    expect(p[1].taxPaid).toBe(0);
    expect(p[2].annualTax).toBeCloseTo(1130.2875, 6);
    expect(p[2].lossCarry).toBe(0);
    const ask = run(
      { returnRate: 5, years: 3, account: 'ask' },
      { entry: 10, distributionYield: 0 },
    );
    expect(ask[2].annualTax).toBeCloseTo(711.6625, 6);
  });
  it('uses ASK deposit room throughout the year even if prices increase', () => {
    const p = run({ initial: 100000, monthly: 10000, account: 'ask' })[0];
    expect(p.accepted).toBe(174200);
    expect(p.outsideCash).toBe(45800);
    expect(p.contributed).toBe(220000);
  });
  it('includes purchase charges in acquisition cost and sale charges in net proceeds', () => {
    const p = run({ returnRate: 0 }, { entry: 1, exit: 1, distributionYield: 0 })[0];
    expect(p.fund).toBe(99000);
    expect(p.basis).toBe(100000);
    expect(p.feesPaid).toBe(1000);
    expect(p.exitFee).toBe(990);
    expect(p.afterSale).toBe(98010);
    expect(p.saleTax).toBe(0);
    expect(p.lossCarry).toBe(1990);
  });
  it('reduces same-year annual tax for an assumed terminal exit charge', () => {
    const p = run({}, { treatment: 'annual', distributionYield: 0, exit: 1 })[0];
    expect(p.exitFee).toBeCloseTo(1073, 6);
    expect(p.saleTax).toBeCloseTo(-289.71, 6);
    expect(p.afterSale).toBeCloseTo(106516.71, 6);
  });
  it('applies verified charges to gross returns, without treating distributions as extra growth', () => {
    const p = run({ account: 'none' }, { ongoing: 1, transaction: 1 })[0];
    expect(p.afterSale).toBeCloseTo(107811, 6);
    expect(p.feesPaid).toBeGreaterThan(0);
    expect(p.taxPaid).toBe(0);
    expect(
      run(
        { initial: 0, monthly: 1000, returnRate: 0, account: 'none' },
        { distributionYield: 0 },
      )[0].wealth,
    ).toBe(12000);
  });
  it('rejects unsupported input bounds', () => {
    expect(fundScenarioSchema.safeParse({ ...scenario, years: 41 }).success).toBe(false);
    expect(() => run({ returnRate: Infinity })).toThrow();
    expect(() => run({}, { distributionYield: -1 })).toThrow();
  });
});

describe('verified comparison facts', () => {
  it('requires an explicit payout assumption and resolves exact fund tax treatment', () => {
    const dk = getInstrument('sparindex-global');
    expect(comparisonModel(dk, scenario, null, 2026).issue).toContain('distribution yield');
    expect(comparisonModel(dk, scenario, 5, 2026).model).toMatchObject({
      ongoing: 0.5,
      distributionYield: 5,
      treatment: 'realisation',
    });
    expect(comparisonModel(getInstrument('eunl'), scenario, null, 2026).model).toMatchObject({
      ongoing: 0.2,
      distributionYield: 0,
      treatment: 'annual',
    });
  });
  it('keeps unknown classifications and future tax years unavailable', () => {
    const unknown = getInstrument('vwce');
    expect(comparisonModel(unknown, scenario, null, 2026).issue).toContain('unverified');
    expect(comparisonModel(unknown, { ...scenario, account: 'ask' }, null, 2026).issue).toContain(
      'unverified',
    );
    expect(
      comparisonModel(unknown, { ...scenario, account: 'none' }, null, 2026).model,
    ).toBeDefined();
    expect(comparisonModel(getInstrument('sparindex-global'), scenario, 5, 2027).issue).toContain(
      'unverified',
    );
    expect(comparisonModel(getInstrument('novo'), scenario, 5, 2026).issue).toContain(
      'Verified costs',
    );
  });
});
