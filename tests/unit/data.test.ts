import { describe, expect, it, vi } from 'vitest';
import { parseWorkspace, validateLedger } from '../../shared/schema';
import { demoWorkspace, emptyWorkspace } from '../../src/lib/demo';
import { importTransactions, exportTransactions } from '../../src/lib/csv';
import { parsePriceResponse, fetchSeries } from '../../functions/src/provider';
import { getInstrument } from '../../shared/catalog';

describe('workspace validation', () => {
  it('rejects sells before purchases and duplicate transaction IDs', () => {
    const buy = demoWorkspace().transactions[0];
    expect(
      validateLedger([
        { ...buy, type: 'sell' },
        { ...buy, id: 'b', date: '2025-02-01' },
      ]),
    ).toContain('exceeds');
    expect(validateLedger([buy, buy])).toContain('unique');
  });
  it('rejects non-finite values, unknown instruments, and invalid dates', () => {
    const data = demoWorkspace();
    expect(() => parseWorkspace({ ...data, plan: { ...data.plan, initial: Infinity } })).toThrow();
    expect(() =>
      parseWorkspace({ ...data, transactions: [{ ...data.transactions[0], date: '2025-02-30' }] }),
    ).toThrow();
    expect(() =>
      parseWorkspace({
        ...data,
        transactions: [{ ...data.transactions[0], instrumentId: 'unknown' }],
      }),
    ).toThrow();
  });
  it('rejects duplicate watchlist records', () => {
    const data = emptyWorkspace();
    expect(() =>
      parseWorkspace({
        ...data,
        watchlist: [
          { instrumentId: 'vwce', note: '' },
          { instrumentId: 'vwce', note: '' },
        ],
      }),
    ).toThrow('duplicates');
  });
});
describe('CSV import', () => {
  it('round-trips quotes, commas, and multiline notes', () => {
    const transactions = demoWorkspace().transactions.map((t) => ({
      ...t,
      note: 'My "reason", with a comma\nand a second line',
    }));
    expect(importTransactions(exportTransactions(transactions), [])).toEqual(transactions);
  });
  it('refuses duplicates when importing an exported ledger twice', () => {
    const transactions = demoWorkspace().transactions;
    expect(() => importTransactions(exportTransactions(transactions), transactions)).toThrow(
      'unique',
    );
  });
  it('rejects missing columns, blank numeric fields, and oversized datasets', () => {
    expect(() => importTransactions('date,price\n2025-01-01,100', [])).toThrow('Required columns');
    expect(() =>
      importTransactions(
        'date,instrument,type,quantity,price,fx_to_dkk,fees_dkk\n2025-01-01,vwce,buy,1,100,,0',
        [],
      ),
    ).toThrow('blank');
    expect(() => importTransactions('x'.repeat(1000001), [])).toThrow('too large');
  });
  it('escapes spreadsheet formulas on export', () => {
    const tx = { ...demoWorkspace().transactions[0], note: '=HYPERLINK("https://example.test")' };
    expect(exportTransactions([tx])).toContain("'=HYPERLINK");
  });
});
describe('market provider validation', () => {
  const response = {
    meta: { symbol: 'VWCE', currency: 'EUR' },
    values: [
      { datetime: '2025-01-02', close: '101' },
      { datetime: '2025-01-01', close: '100' },
    ],
  };
  it('sorts series and rejects mismatched currency, symbol, dates and prices', () => {
    expect(parsePriceResponse(response, getInstrument('vwce'))[0].date).toBe('2025-01-01');
    expect(() =>
      parsePriceResponse(
        { ...response, meta: { ...response.meta, currency: 'USD' } },
        getInstrument('vwce'),
      ),
    ).toThrow('currency');
    expect(() =>
      parsePriceResponse(
        { ...response, meta: { ...response.meta, symbol: 'MSFT' } },
        getInstrument('vwce'),
      ),
    ).toThrow('symbol');
    expect(() =>
      parsePriceResponse(
        { ...response, values: [{ datetime: '2025-02-30', close: 'NaN' }] },
        getInstrument('vwce'),
      ),
    ).toThrow();
  });
  it('handles provider error payloads without accepting them as prices', () => {
    expect(() =>
      parsePriceResponse({ status: 'error', message: 'quota' }, getInstrument('vwce')),
    ).toThrow();
  });
  it('loads price and FX data without exposing provider credentials in the result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { symbol: 'EUR/DKK' },
          values: [{ datetime: '2025-01-02', close: '7.46' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const quota = vi.fn().mockResolvedValue(undefined);
      const result = await fetchSeries(getInstrument('vwce'), 'test-secret', quota);
      expect(result.fxToDkk).toBe(7.46);
      expect(quota).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toContain('test-secret');
      expect(result.source).toBe('Twelve Data');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
