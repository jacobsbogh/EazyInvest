import { describe, expect, it } from 'vitest';
import { instruments } from '../../shared/catalog';
import { instrumentSchema } from '../../shared/instrument';
import { parseWorkspace } from '../../shared/schema';
import { emptyWorkspace } from '../../src/lib/demo';
import { parseSearchResults } from '../../jobs/src/listings';
import { nextBudget } from '../../jobs/src/budget';
import { exportTransactions, importTransactions } from '../../src/lib/csv';

const match = {
  '1. symbol': 'IBM',
  '2. name': 'International Business Machines',
  '3. type': 'Equity',
  '4. region': 'United States',
  '8. currency': 'USD',
};
const custom = () => parseSearchResults({ bestMatches: [match] })[0];
describe('growing investment catalog', () => {
  it('validates the reference metadata without claiming prices or invented ISINs', () => {
    expect(instruments.length).toBe(25);
    for (const item of instruments) expect(instrumentSchema.safeParse(item).success).toBe(true);
    expect(instruments.find((item) => item.ticker === 'AAPL')?.isin).toBe('');
  });
  it('upgrades existing workspaces and retains custom definitions in backups', () => {
    const {
      customInstruments: _unused,
      strategies: _s,
      preferredStrategyId: _p,
      ...old
    } = emptyWorkspace();
    const upgraded = parseWorkspace({ ...old, version: 1 });
    expect(upgraded.version).toBe(3);
    expect(upgraded.customInstruments).toEqual([]);
    const workspace = {
      ...upgraded,
      customInstruments: [custom()],
      watchlist: [{ instrumentId: custom().id, note: 'Research' }],
    };
    expect(parseWorkspace(JSON.parse(JSON.stringify(workspace)))).toEqual(workspace);
    expect(() => parseWorkspace({ ...workspace, customInstruments: [] })).toThrow(
      'Unknown investment',
    );
    expect(() => parseWorkspace({ ...workspace, customInstruments: [custom(), custom()] })).toThrow(
      'Duplicate',
    );
  });
  it('keeps exact listings and ignores unsupported currencies, venues and types', () => {
    const results = parseSearchResults({
      bestMatches: [
        match,
        match,
        { ...match, '1. symbol': 'IBM.LON', '4. region': 'United Kingdom', '8. currency': 'GBP' },
        { ...match, '1. symbol': 'IBM.FRK', '4. region': 'Frankfurt', '8. currency': 'EUR' },
        { ...match, '1. symbol': 'OTHER', '3. type': 'Mutual Fund' },
        { ...match, '1. symbol': 'AAPL', '8. currency': 'EUR' },
      ],
    });
    expect(results.map((item) => item.id)).toEqual(['av-ibm']);
    expect(results[0].exchange).toBe('US');
    expect(results[0].providerSymbol).toBe('IBM');
  });
  it('imports custom instruments by their saved ID and rejects unknown CSV entries', () => {
    const tx = {
      id: 'custom-buy',
      instrumentId: custom().id,
      type: 'buy' as const,
      date: '2026-01-02',
      quantity: 2,
      price: 100,
      fx: 6,
      fees: 10,
      note: '',
    };
    const csv = exportTransactions([tx]);
    expect(importTransactions(csv, [], [...instruments, custom()])).toEqual([tx]);
    expect(() => importTransactions(csv, [])).toThrow();
  });
});
describe('persistent free API allowance', () => {
  const now = Date.parse('2026-10-04T10:00:00Z');
  it('reserves before the call, including failed attempts and later runs', () => {
    let budget = nextBudget(undefined, now);
    for (let i = 1; i < 25; i++) budget = nextBudget(budget, now + i * 13000);
    expect(budget.used).toBe(25);
    expect(() => nextBudget(budget, Date.parse('2026-10-04T23:59:59Z'))).toThrow('quota');
  });
  it('resets on the next UTC day while preserving spacing across midnight', () => {
    const midnight = Date.parse('2026-10-05T00:00:00Z');
    const next = nextBudget(
      { day: '2026-10-04', used: 25, lastRequestAt: midnight - 1000 },
      midnight,
    );
    expect(next.used).toBe(1);
    expect(next.day).toBe('2026-10-05');
    expect(next.lastRequestAt).toBe(midnight + 12000);
    expect(() => nextBudget({ ...next, day: '2026-10-06' }, midnight)).toThrow('ahead');
  });
});
