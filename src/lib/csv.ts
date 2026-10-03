import Papa from 'papaparse';
import { instruments } from '../../shared/catalog';
import { transactionSchema, validateLedger } from '../../shared/schema';
import type { Transaction } from '../../shared/schema';
const headers = [
  'id',
  'date',
  'instrument',
  'type',
  'quantity',
  'price',
  'fx_to_dkk',
  'fees_dkk',
  'note',
];
export function exportTransactions(transactions: Transaction[]) {
  return Papa.unparse(
    {
      fields: headers,
      data: transactions.map((t) => [
        t.id,
        t.date,
        t.instrumentId,
        t.type,
        t.quantity,
        t.price,
        t.fx,
        t.fees,
        t.note,
      ]),
    },
    { escapeFormulae: true },
  );
}
export function importTransactions(csv: string, existing: Transaction[]): Transaction[] {
  if (csv.length > 1_000_000)
    throw new Error('This file is too large. Import up to 500 transactions at a time.');
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^\uFEFF/, ''),
  });
  if (result.errors.length) throw new Error(`CSV could not be read: ${result.errors[0].message}`);
  const required = headers.filter((h) => h !== 'id' && h !== 'note');
  if (required.some((h) => !result.meta.fields?.includes(h)))
    throw new Error(
      `Required columns: ${required.join(', ')}. Download the template for the supported format.`,
    );
  if (!result.data.length) throw new Error('The CSV has no transactions.');
  if (result.data.length + existing.length > 500)
    throw new Error('A workspace supports at most 500 transactions.');
  const parsed = result.data.map((row, index) => {
    const instrument = instruments.find(
      (i) =>
        i.id === row.instrument.trim().toLowerCase() ||
        i.ticker.toLowerCase() === row.instrument.trim().toLowerCase() ||
        i.isin === row.instrument.trim(),
    );
    const requiredNumbers = ['quantity', 'price', 'fx_to_dkk', 'fees_dkk'];
    if (requiredNumbers.some((key) => row[key]?.trim() === ''))
      throw new Error(`Row ${index + 2}: numeric fields cannot be blank.`);
    const tx = transactionSchema.safeParse({
      id: row.id?.trim() || crypto.randomUUID(),
      date: row.date.trim(),
      instrumentId: instrument?.id,
      type: row.type.trim().toLowerCase(),
      quantity: Number(row.quantity),
      price: Number(row.price),
      fx: Number(row.fx_to_dkk),
      fees: Number(row.fees_dkk),
      note: row.note ?? '',
    });
    if (!tx.success)
      throw new Error(
        `Row ${index + 2}: ${tx.error.issues[0].path.join('.')} — ${tx.error.issues[0].message}`,
      );
    return tx.data;
  });
  const error = validateLedger([...existing, ...parsed]);
  if (error) throw new Error(error);
  return parsed;
}
