import { holdingsSchema, type HoldingsSnapshot } from '../../shared/holdings';
const files = import.meta.glob('../../shared/data/holdings/*.json');
const cache = new Map<string, Promise<HoldingsSnapshot | undefined>>();
export function loadHoldings(id: string) {
  if (!cache.has(id))
    cache.set(
      id,
      (async () => {
        const importer = files[`../../shared/data/holdings/${id}.json`];
        if (!importer) return undefined;
        const file = (await importer()) as { default: unknown };
        return holdingsSchema.parse(file.default);
      })().catch((error) => {
        cache.delete(id);
        throw error;
      }),
    );
  return cache.get(id)!;
}
