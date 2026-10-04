import { z } from 'zod';
import skat from './data/skat-2026.json' with { type: 'json' };
import reviewedFacts from './data/fund-facts.json' with { type: 'json' };
import type { Instrument } from './instrument.js';
import type { Strategy } from './strategy.js';

const source = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));
const chargeSchema = z
  .object({
    percent: z.number().finite().min(0).max(10),
    checkedAt: z.string().date(),
    source,
  })
  .strict();
const factSchema = z
  .object({
    isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/),
    incomeTreatment: z.enum(['accumulating', 'distributing']),
    cost: chargeSchema.extend({ basis: z.enum(['ongoing', 'TER']) }),
    transactionCost: chargeSchema.optional(),
    entryCost: chargeSchema.optional(),
    exitCost: chargeSchema.optional(),
    tax: z
      .object({
        kind: z.literal('equity-realisation-distributions'),
        year: z.number().int(),
        checkedAt: z.string().date(),
        source,
      })
      .strict()
      .optional(),
    historyNote: z
      .object({ text: z.string().max(500), source })
      .strict()
      .optional(),
  })
  .strict();
const facts = z.array(factSchema).parse(reviewedFacts);
if (new Set(facts.map((fact) => fact.isin)).size !== facts.length)
  throw new Error('Duplicate fund facts.');
const byIsin = new Map(facts.map((fact) => [fact.isin, fact]));
export type FundCost = z.infer<typeof chargeSchema> & { basis: 'ongoing' | 'TER' };
export type TaxTreatment = {
  kind: 'equity-realisation-distributions' | 'equity-annual' | 'unknown' | 'not-applicable';
  year?: number;
  checkedAt?: string;
  source?: string;
};
const listed = new Set(skat.isins);
export const skatSnapshot = {
  year: skat.year,
  source: skat.source,
  publishedAt: skat.publishedAt,
  reviewedAt: skat.reviewedAt,
};
// Exchange/reference security type is separate from investment structure.
// Investment-company shares are not evidence of zero fees or ordinary-share tax.
export function isFundLike(item: Instrument) {
  return item.kind !== 'Stock' || item.yahooType === 'MUTUALFUND';
}
export function fundFacts(item: Instrument, year = new Date().getUTCFullYear()) {
  const fact = isFundLike(item) ? byIsin.get(item.isin) : undefined;
  const taxStatus = !isFundLike(item)
    ? ('not-applicable' as const)
    : !item.isin || year !== skat.year || skat.uncertainIsins.includes(item.isin)
      ? ('unknown' as const)
      : listed.has(item.isin)
        ? ('listed' as const)
        : ('not-found' as const);
  const taxTreatment: TaxTreatment =
    fact?.tax?.year === year
      ? fact.tax
      : taxStatus === 'listed'
        ? { kind: 'equity-annual', year, checkedAt: skat.reviewedAt, source: skat.source }
        : { kind: isFundLike(item) ? 'unknown' : 'not-applicable' };
  return { ...fact, cost: fact?.cost, taxStatus, taxTreatment };
}
export function weightedFundCost(strategy: Strategy, catalog: Instrument[]): number | null {
  let total = 0;
  for (const a of strategy.allocations) {
    const item = catalog.find((i) => i.id === a.instrumentId);
    if (!item) return null;
    if (!isFundLike(item)) continue;
    const cost = fundFacts(item).cost;
    if (!cost) return null;
    total += (a.weight / 100) * cost.percent;
  }
  return Number(total.toFixed(6));
}

/** The planner's share-income models cannot represent annual fund distributions. */
export function strategyTaxIssue(
  strategy: Strategy,
  catalog: Instrument[],
  year = new Date().getUTCFullYear(),
): string | null {
  if (strategy.account === 'none' || strategy.account === 'ask') return null;
  const funds = strategy.allocations
    .map((a) => catalog.find((i) => i.id === a.instrumentId))
    .filter((i): i is Instrument => !!i && isFundLike(i));
  if (funds.some((item) => fundFacts(item, year).taxTreatment.kind === 'unknown'))
    return 'A fund’s ordinary-account tax classification is unverified. Choose before-tax planning or verify a separate account illustration.';
  if (
    funds.some(
      (item) => fundFacts(item, year).taxTreatment.kind === 'equity-realisation-distributions',
    )
  )
    return 'This fund taxes realised gains and distributions. The planner does not model distribution tax; choose before-tax planning or a separate ASK illustration.';
  if (
    strategy.account === 'general' &&
    funds.some((item) => fundFacts(item, year).taxTreatment.kind === 'equity-annual')
  )
    return 'This strategy includes a fund on SKAT’s equity-investment-company list. Its ordinary-account illustration needs annual taxation rather than tax on sale.';
  return null;
}
