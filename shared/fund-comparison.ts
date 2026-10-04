import { z } from 'zod';
import type { Instrument } from './instrument.js';
import { fundFacts } from './fund-facts.js';
import { equityTax, tax2026 } from './tax.js';

export const fundScenarioSchema = z
  .object({
    initial: z.number().finite().min(0).max(100000000),
    monthly: z.number().finite().min(0).max(1000000),
    years: z.number().int().min(1).max(40),
    returnRate: z.number().finite().min(-10).max(20),
    account: z.enum(['none', 'ordinary', 'ask']),
    married: z.boolean(),
    otherIncome: z.number().finite().min(0).max(100000000),
    reinvest: z.boolean(),
    includeTransactionCosts: z.boolean(),
    includeEntryExitCosts: z.boolean(),
  })
  .strict();
export type FundScenario = z.infer<typeof fundScenarioSchema>;
const modelSchema = z
  .object({
    ongoing: z.number().finite().min(0).max(10),
    transaction: z.number().finite().min(0).max(10),
    entry: z.number().finite().min(0).max(10),
    exit: z.number().finite().min(0).max(10),
    distributionYield: z.number().finite().min(0).max(20),
    treatment: z.enum(['realisation', 'annual']),
  })
  .strict();
export type FundModel = z.infer<typeof modelSchema>;
export type FundYear = {
  year: number;
  contributed: number;
  accepted: number;
  fund: number;
  cash: number;
  outsideCash: number;
  basis: number;
  distribution: number;
  distributionTax: number;
  annualTax: number;
  taxPaid: number;
  feesPaid: number;
  wealth: number;
  saleTax: number;
  exitFee: number;
  afterSale: number;
  lossCarry: number;
};

/** Resolve exact, dated issuer facts before allowing a personal-tax illustration. */
export function comparisonModel(
  item: Instrument,
  scenario: FundScenario,
  distributionYield: number | null,
  year = new Date().getUTCFullYear(),
): { model: FundModel; issue?: never } | { issue: string; model?: never } {
  const facts = fundFacts(item, year);
  if (!facts.cost || !facts.incomeTreatment)
    return { issue: 'Verified costs and income treatment are required for this fund.' };
  if (facts.incomeTreatment === 'distributing' && distributionYield === null)
    return { issue: 'Enter a distribution yield assumption to calculate this fund.' };
  if (scenario.account !== 'none') {
    if (year !== tax2026.year || facts.taxTreatment.kind === 'unknown')
      return {
        issue: 'Tax classification is unverified for the current year. Use before-tax comparison.',
      };
    if (!['equity-annual', 'equity-realisation-distributions'].includes(facts.taxTreatment.kind))
      return { issue: 'This tax classification is outside the supported fund models.' };
  }
  const parsed = modelSchema.safeParse({
    ongoing: facts.cost.percent,
    transaction: scenario.includeTransactionCosts ? (facts.transactionCost?.percent ?? 0) : 0,
    entry: scenario.includeEntryExitCosts ? (facts.entryCost?.percent ?? 0) : 0,
    exit: scenario.includeEntryExitCosts ? (facts.exitCost?.percent ?? 0) : 0,
    distributionYield: facts.incomeTreatment === 'accumulating' ? 0 : distributionYield,
    treatment:
      facts.taxTreatment.kind === 'equity-realisation-distributions' ? 'realisation' : 'annual',
  });
  return parsed.success
    ? { model: parsed.data }
    : { issue: 'Distribution yield must be between 0% and 20%.' };
}

/** Independent deterministic scenario; histories are never used as forecasts. */
export function calculateFundScenario(input: FundScenario, definition: FundModel): FundYear[] {
  const s = fundScenarioSchema.parse(input),
    m = modelSchema.parse(definition);
  const annual = s.account === 'ask' || (s.account === 'ordinary' && m.treatment === 'annual');
  const marginalTax = (income: number) =>
    s.account === 'ask'
      ? Math.max(0, income) * tax2026.askRate
      : equityTax(s.otherIncome + Math.max(0, income), s.married) -
        equityTax(s.otherIncome, s.married);
  let fund = 0,
    cash = 0,
    outsideCash = 0,
    basis = 0;
  let contributed = 0,
    accepted = 0,
    taxPaid = 0,
    feesPaid = 0,
    carry = 0;
  const points: FundYear[] = [];
  function buy(amount: number) {
    const fee = (amount * m.entry) / 100;
    fund += amount - fee;
    basis += amount;
    feesPaid += fee;
  }
  function deposit(amount: number, room: number) {
    const allowed = s.account === 'ask' ? Math.min(amount, Math.max(0, room)) : amount;
    contributed += amount;
    accepted += allowed;
    outsideCash += amount - allowed;
    buy(allowed);
    return allowed;
  }
  deposit(s.initial, tax2026.askLimit);
  const growth = Math.pow(1 + s.returnRate / 100, 1 / 12);
  const feeFactor = Math.pow(1 - m.ongoing / 100, 1 / 12);
  const transactionFactor = Math.pow(1 - m.transaction / 100, 1 / 12);
  for (let year = 1; year <= s.years; year++) {
    // The first opening value precedes the initial deposit for annual taxation.
    const opening = year === 1 ? 0 : fund + cash;
    const carryAtOpening = carry;
    let deposits = year === 1 ? Math.min(s.initial, accepted) : 0;
    let room =
      s.account === 'ask'
        ? Math.max(0, tax2026.askLimit - (year === 1 ? 0 : opening) - (year === 1 ? deposits : 0))
        : Infinity;
    for (let month = 0; month < 12; month++) {
      const grown = fund * growth;
      const afterOngoing = grown * feeFactor;
      fund = afterOngoing * transactionFactor;
      feesPaid += grown - fund;
      const paid = deposit(s.monthly, room);
      deposits += paid;
      room -= paid;
    }
    // Gross total return already includes distributions. Remove the payout once.
    const distribution = (fund * m.distributionYield) / 100;
    fund -= distribution;
    let distributionTax = 0,
      annualTax = 0;
    if (s.account === 'ordinary' && !annual) distributionTax = marginalTax(distribution);
    cash += distribution - distributionTax;
    taxPaid += distributionTax;
    if (s.reinvest) {
      buy(cash);
      cash = 0;
    }
    const annualGain = fund + cash - opening - deposits;
    if (annual) {
      annualTax = marginalTax(annualGain - carry);
      carry = Math.max(0, carry - annualGain);
      // Annual-tax models can redeem units to fund tax without a second levy.
      const fromCash = Math.min(cash, annualTax);
      cash -= fromCash;
      fund -= annualTax - fromCash;
      taxPaid += annualTax;
    }
    const wealth = fund + cash + outsideCash;
    const exitFee = (fund * m.exit) / 100;
    let saleTax = 0,
      lossCarry = carry;
    if (s.account === 'ordinary' && !annual) {
      const finalIncome = distribution + fund - exitFee - basis;
      saleTax = marginalTax(finalIncome) - distributionTax;
      lossCarry = Math.max(0, -finalIncome);
    } else if (annual) {
      // A sale at this year end reduces the same year's taxable gain by its fee.
      saleTax = marginalTax(annualGain - exitFee - carryAtOpening) - annualTax;
      lossCarry = Math.max(0, carryAtOpening - annualGain + exitFee);
    }
    const point = {
      year,
      contributed,
      accepted,
      fund,
      cash,
      outsideCash,
      basis,
      distribution,
      distributionTax,
      annualTax,
      taxPaid,
      feesPaid,
      wealth,
      saleTax,
      exitFee,
      afterSale: wealth - exitFee - saleTax,
      lossCarry,
    };
    if (
      Object.values(point).some((n) => !Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER)
    )
      throw new Error('Scenario exceeds the supported numeric range.');
    points.push(point);
  }
  return points;
}
