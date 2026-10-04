import { readFile, writeFile } from 'node:fs/promises';
import {
  fetchDanishListings,
  enrichDanishListing,
  mergeDanishListings,
} from './danish-listings.js';
import { ProviderError } from './alpha-vantage.js';
import { instrumentSchema } from '../../shared/instrument.js';
import { z } from 'zod';

const previous = z
  .object({ listings: z.array(instrumentSchema) })
  .parse(JSON.parse(await readFile('shared/danish-listings.json', 'utf8'))).listings;
const current = await fetchDanishListings();
if (current.length < previous.filter((item) => item.referenceStatus !== 'retained').length * 0.75)
  throw new Error('Unexpectedly incomplete reference refresh; snapshot retained.');
const listings = mergeDanishListings(current, previous);
let mapped = 0;
for (let i = 0; i < listings.length; i++) {
  try {
    if (listings[i].referenceStatus === 'retained') continue;
    listings[i] = await enrichDanishListing(listings[i]);
    if (listings[i].yahooSymbol) mapped++;
  } catch (error) {
    if (error instanceof ProviderError && error.reason === 'quota') throw error;
    throw new Error(`Symbol lookup failed for ${listings[i].isin}; catalogue was not replaced.`);
  }
  if ((i + 1) % 20 === 0) console.log(`Checked ${i + 1}/${listings.length} ISINs.`);
  await new Promise((resolve) => setTimeout(resolve, 250));
}
await writeFile(
  'shared/danish-listings.json',
  JSON.stringify(
    { asOf: new Date().toISOString().slice(0, 10), source: 'ESMA FIRDS', listings },
    null,
    2,
  ) + '\n',
);
console.log(
  `Saved ${listings.length} Danish listings; ${mapped} have an unambiguous Copenhagen history symbol. Unmapped listings remain visible.`,
);
