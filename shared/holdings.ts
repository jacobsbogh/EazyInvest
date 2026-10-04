import { z } from 'zod';
import type { Instrument } from './instrument.js';
import { isFundLike } from './fund-facts.js';
const isin = z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/);
const text = z.string().min(1).max(200);
export const holdingRowSchema = z.tuple([
  isin,
  text,
  z.number().finite().positive().max(100),
  text,
  text,
  text.nullable(),
  text.nullable(),
]);
export const holdingsSchema = z
  .object({
    version: z.literal(1),
    instrumentId: z.string().regex(/^[a-z0-9-]+$/),
    fundIsin: isin,
    source: z.string().url(),
    identitySource: z.string().url().optional(),
    downloadSource: z.string().url().optional(),
    asOf: z.string().date(),
    checkedAt: z.string().date(),
    method: z.enum(['issuer-isin', 'reviewed-subset']),
    reportedEquityWeight: z.number().finite().min(0).max(100.5).nullable(),
    rescaled: z.boolean(),
    holdings: z.array(holdingRowSchema).min(1).max(10000),
  })
  .strict()
  .superRefine((s, ctx) => {
    const sum = s.holdings.reduce((n, h) => n + h[2], 0);
    if (sum > 100.00001 || new Set(s.holdings.map((h) => h[0])).size !== s.holdings.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Holdings must have unique ISINs and at most 100% weight.',
      });
    if (s.asOf > s.checkedAt)
      ctx.addIssue({ code: 'custom', message: 'Holdings date cannot follow verification.' });
    if (s.method === 'reviewed-subset' && !s.identitySource)
      ctx.addIssue({ code: 'custom', message: 'Reviewed subsets require an identity source.' });
  });
export type HoldingsSnapshot = z.infer<typeof holdingsSchema>;
export type HoldingRow = z.infer<typeof holdingRowSchema>;
export type Exposure = {
  holdings: Map<string, { name: string; weight: number }>;
  countries: Map<string, number>;
  sectors: Map<string, number>;
  covered: number;
  unknown: number;
  sources: HoldingsSnapshot[];
};
const countryAliases: Record<string, string> = {
  USA: 'United States',
  Danmark: 'Denmark',
  Storbritannien: 'United Kingdom',
};
function add(map: Map<string, number>, key: string, n: number) {
  map.set(key, (map.get(key) ?? 0) + n);
}

/** Weight each observed security by target allocations without normalizing gaps away. */
export function strategyExposure(
  allocations: { instrumentId: string; weight: number }[],
  catalog: Instrument[],
  snapshots: HoldingsSnapshot[],
): Exposure {
  if (
    !allocations.length ||
    allocations.length > 5 ||
    new Set(allocations.map((a) => a.instrumentId)).size !== allocations.length ||
    allocations.some((a) => !Number.isFinite(a.weight) || a.weight <= 0) ||
    Math.abs(allocations.reduce((s, a) => s + a.weight, 0) - 100) > 0.000001
  )
    throw new Error('Exposure allocations must total 100%.');
  const holdings: Exposure['holdings'] = new Map(),
    countries = new Map<string, number>(),
    sectors = new Map<string, number>(),
    sources: HoldingsSnapshot[] = [];
  function observe(isin: string, name: string, weight: number, country?: string, sector?: string) {
    const previous = holdings.get(isin);
    holdings.set(isin, { name: previous?.name ?? name, weight: (previous?.weight ?? 0) + weight });
    if (country) add(countries, countryAliases[country] ?? country, weight);
    if (sector) add(sectors, sector, weight);
  }
  for (const a of allocations) {
    const item = catalog.find((i) => i.id === a.instrumentId);
    if (!item) throw new Error('Unknown exposure investment.');
    if (isFundLike(item)) {
      const snapshot = snapshots.find(
        (s) => s.instrumentId === item.id && s.fundIsin === item.isin,
      );
      if (!snapshot) continue;
      sources.push(snapshot);
      const issuer = new URL(snapshot.source).hostname.replace(/^www\./, '');
      for (const h of snapshot.holdings)
        observe(h[0], h[1], (a.weight * h[2]) / 100, h[3], `${issuer}: ${h[4]}`);
    } else {
      // Empty stock ISINs may resolve only through an exact ticker + exchange record.
      const candidates = snapshots
        .flatMap((s) => s.holdings)
        .filter(
          (h) =>
            h[5] === item.ticker &&
            (h[6] === item.exchange ||
              (item.exchange === 'NYSE' && h[6] === 'New York Stock Exchange Inc.')),
        );
      const ids = new Set(candidates.map((h) => h[0]));
      const id = item.isin || (ids.size === 1 ? [...ids][0] : '');
      if (!id) continue;
      const matching = candidates.find((h) => h[0] === id);
      observe(id, item.name, a.weight, matching?.[3]);
      if (matching)
        for (const source of snapshots)
          if (source.holdings.some((h) => h === matching)) sources.push(source);
    }
  }
  const covered = Math.min(
    100,
    [...holdings.values()].reduce((s, h) => s + h.weight, 0),
  );
  return {
    holdings,
    countries,
    sectors,
    covered,
    unknown: Math.max(0, 100 - covered),
    sources: [...new Map(sources.map((s) => [s.instrumentId, s])).values()],
  };
}
export function securityOverlap(a: Exposure, b: Exposure) {
  const shared = [...a.holdings]
    .flatMap(([isin, h]) => {
      const other = b.holdings.get(isin);
      return other
        ? [
            {
              isin,
              name: h.name,
              first: h.weight,
              second: other.weight,
              shared: Math.min(h.weight, other.weight),
            },
          ]
        : [];
    })
    .sort((x, y) => y.shared - x.shared);
  const observed = shared.reduce((s, h) => s + h.shared, 0);
  // Each unmatched remainder can increase overlap, but total common mass is at most 100%.
  const upper = Math.min(100, observed + a.unknown + b.unknown);
  return { observed, upper, shared };
}
