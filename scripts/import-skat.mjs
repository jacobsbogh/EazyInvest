import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSkatWorkbook } from './skat-xlsx.mjs';

// Generates a candidate for review. It never changes the app's approved snapshot.
const [file, yearText, source, publishedAt] = process.argv.slice(2);
const year = Number(yearText);
const url = new URL(source);
if (
  url.protocol !== 'https:' ||
  url.hostname !== 'skat.dk' ||
  url.username ||
  url.password ||
  !url.pathname.endsWith('.xlsx') ||
  !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
)
  throw new Error('Supply an official SKAT XLSX URL and its publication date.');
const input = await readFile(file);
const snapshot = {
  year,
  source,
  publishedAt,
  reviewedAt: null,
  sha256: createHash('sha256').update(input).digest('hex'),
  ...parseSkatWorkbook(input, year),
};
const output = `.cache/skat-${year}-candidate.json`;
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log({
  candidate: output,
  year,
  uniqueIsins: snapshot.isins.length,
  rows: snapshot.rowCount,
  skippedNonIsinRows: snapshot.skippedNonIsinRows,
});
