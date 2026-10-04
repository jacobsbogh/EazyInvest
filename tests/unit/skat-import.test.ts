import { describe, expect, it } from 'vitest';
import { parseSkatWorkbook, xlsxRows, xlsxEntries } from '../../scripts/skat-xlsx.mjs';

// Small synthetic workbook, with no copied company names or personal records.
function workbook(extraRows = '') {
  const cells = (row: number, values: Record<string, string>) =>
    `<row r="${row}">${Object.entries(values)
      .map(([c, v]) => `<c r="${c}${row}" t="inlineStr"><is><t>${v}</t></is></c>`)
      .join('')}</row>`;
  const header = cells(1, { B: 'ISIN-kode/-Code', I: 'Registered', J: 'Deregistered' });
  const entries = [
    ['xl/workbook.xml', '<workbook><sheets><sheet name="2026" r:id="rId7" /></sheets></workbook>'],
    [
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId7" Target="worksheets/sheet2.xml" /></Relationships>',
    ],
    [
      'xl/worksheets/sheet2.xml',
      `<worksheet><sheetData>${header}${Array.from({ length: 101 }, (_, i) => cells(i + 2, { B: `IE00ABC${String(i).padStart(5, '0')}`, I: '2025,2026', J: '2024' })).join('')}${extraRows}</sheetData></worksheet>`,
    ],
  ];
  const local: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, xml] of entries) {
    const n = Buffer.from(name);
    const value = Buffer.from(xml);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt32LE(value.length, 18);
    head.writeUInt32LE(value.length, 22);
    head.writeUInt16LE(n.length, 26);
    const d = Buffer.alloc(46);
    d.writeUInt32LE(0x02014b50);
    d.writeUInt32LE(value.length, 20);
    d.writeUInt32LE(value.length, 24);
    d.writeUInt16LE(n.length, 28);
    d.writeUInt32LE(offset, 42);
    local.push(head, n, value);
    directory.push(d, n);
    offset += head.length + n.length + value.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...directory, end]);
}
describe('year-specific official SKAT workbook import', () => {
  it('resolves the selected year through its workbook relationship and exact ISINs', () => {
    const result = parseSkatWorkbook(workbook(), 2026);
    expect(result.isins).toHaveLength(101);
    expect(result.isins[0]).toBe('IE00ABC00000');
    expect(() => parseSkatWorkbook(workbook(), 2025)).toThrow('year sheet');
    expect(result.uncertainIsins).toEqual([]);
  });
  it('excludes deregistered years, marks conflicts unknown, and deduplicates', () => {
    const row = (isin: string, registered: string, deregistered: string) =>
      `<row><c r="B999" t="inlineStr"><is><t>${isin}</t></is></c><c r="I999" t="inlineStr"><is><t>${registered}</t></is></c><c r="J999" t="inlineStr"><is><t>${deregistered}</t></is></c></row>`;
    const result = parseSkatWorkbook(
      workbook(
        row('IE00ABC00000', '2026', '') +
          row('IE00ABC00001', '2025,2026', '2026') +
          row('IE00ABC90000', '2025', '2026'),
      ),
      2026,
    );
    expect(result.isins).toHaveLength(100);
    expect(result.uncertainIsins).toEqual(['IE00ABC00001']);
    expect(result.isins).not.toContain('IE00ABC90000');
  });
  it('reads shared strings and escaped text without evaluating formulas', () => {
    const entries = new Map([
      ['xl/sharedStrings.xml', '<sst><si><t>A &amp; B</t></si></sst>'],
      [
        'sheet',
        '<worksheet><row><c r="B1" t="s"><v>0</v></c><c r="I1"><f>NOW()</f><v>2026</v></c></row></worksheet>',
      ],
    ]);
    expect(xlsxRows(entries, 'sheet')).toEqual([{ B: 'A & B', I: '2026' }]);
    expect(() => xlsxEntries(Buffer.from('not a workbook'))).toThrow();
  });
});
