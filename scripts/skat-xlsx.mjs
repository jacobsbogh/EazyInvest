import { inflateRawSync } from 'node:zlib';

// A bounded reader for the official XLSX's stored/deflated XML entries. No macros,
// formulas or external relationships are executed; only cached cell text is read.
export function xlsxEntries(buffer) {
  if (buffer.length < 22 || buffer.length > 20_000_000)
    throw new Error('Workbook size is invalid.');
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50)
    end--;
  if (end < Math.max(0, buffer.length - 65557)) throw new Error('Invalid XLSX archive.');
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(position) !== 0x02014b50) throw new Error('Invalid archive directory.');
    const method = buffer.readUInt16LE(position + 10);
    const compressed = buffer.readUInt32LE(position + 20);
    const expanded = buffer.readUInt32LE(position + 24);
    const nameSize = buffer.readUInt16LE(position + 28);
    const extraSize = buffer.readUInt16LE(position + 30);
    const commentSize = buffer.readUInt16LE(position + 32);
    const offset = buffer.readUInt32LE(position + 42);
    const name = buffer.toString('utf8', position + 46, position + 46 + nameSize);
    position += 46 + nameSize + extraSize + commentSize;
    total += expanded;
    if (expanded > 20_000_000 || total > 60_000_000)
      throw new Error('Expanded workbook is too large.');
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error('Invalid entry header.');
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const payload = buffer.subarray(start, start + compressed);
    const data =
      method === 0
        ? payload
        : method === 8
          ? inflateRawSync(payload, { maxOutputLength: 20_000_000 })
          : null;
    if (!data || data.length !== expanded) throw new Error('Unsupported or damaged entry.');
    entries.set(name, data.toString('utf8'));
  }
  return entries;
}
const decode = (text) =>
  text
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) =>
      String.fromCodePoint(n[0] === 'x' ? parseInt(n.slice(1), 16) : Number(n)),
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
const texts = (xml) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
export function xlsxRows(entries, path) {
  const xml = entries.get(path);
  if (!xml) throw new Error('Workbook sheet is missing.');
  const shared = [
    ...(entries.get('xl/sharedStrings.xml') ?? '').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g),
  ].map((m) => texts(m[1]));
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const values = {};
    for (const match of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = match[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      const value = match[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
      if (reference)
        values[reference] = /\bt="s"/.test(match[1])
          ? (shared[Number(value)] ?? '')
          : /\bt="inlineStr"/.test(match[1])
            ? texts(match[2])
            : decode(value);
    }
    return values;
  });
}
export function parseSkatWorkbook(buffer, year) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new Error('Choose a valid tax year.');
  const entries = xlsxEntries(buffer);
  const workbook = entries.get('xl/workbook.xml') ?? '';
  const sheet = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].find((m) =>
    m[1].includes(`name="${year}"`),
  );
  const relationship = sheet?.[1].match(/r:id="([^"]+)"/)?.[1];
  const rels = entries.get('xl/_rels/workbook.xml.rels') ?? '';
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].find((m) =>
    m[1].includes(`Id="${relationship}"`),
  );
  const target = rel?.[1].match(/Target="([^"]+)"/)?.[1];
  if (!target || !/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target))
    throw new Error('The requested year sheet is missing.');
  const rows = xlsxRows(
    entries,
    target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`,
  );
  if (
    rows[0]?.B !== 'ISIN-kode/-Code' ||
    !rows[0]?.I?.includes('Registered') ||
    !rows[0]?.J?.includes('Deregistered')
  )
    throw new Error('Official workbook columns changed; review the importer.');
  const isins = new Set();
  const uncertain = new Set();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const isin = row.B?.trim();
    if (!isin) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) {
      skipped++;
      continue;
    }
    const registered = (row.I ?? '').match(/\d{4}/g) ?? [];
    const deregistered = (row.J ?? '').match(/\d{4}/g) ?? [];
    if (registered.includes(String(year)) && deregistered.includes(String(year))) {
      uncertain.add(isin);
      continue;
    }
    if (registered.includes(String(year)) && !deregistered.includes(String(year))) isins.add(isin);
  }
  if (isins.size < 100) throw new Error('Too few ISINs; review the source and year.');
  for (const isin of uncertain) isins.delete(isin);
  return {
    isins: [...isins].sort(),
    uncertainIsins: [...uncertain].sort(),
    rowCount: rows.length - 1,
    skippedNonIsinRows: skipped,
  };
}
