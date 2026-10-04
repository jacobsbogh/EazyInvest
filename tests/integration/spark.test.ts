import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import {
  loadWorkspace,
  saveWorkspace,
  loadMarket,
  loadRegistry,
  searchMarkets,
  queueHistory,
  loadQuotes,
} from '../../src/lib/cloud';
import { instruments } from '../../shared/catalog';
import { processRequests, seedRegistry } from '../../jobs/src/requests';
import { dailyAllowance } from '../../jobs/src/budget';
import { emptyWorkspace, demoMarket } from '../../src/lib/demo';
import { parseYahooSeries, yahooSymbol } from '../../jobs/src/yahoo';
import { refreshInstrument } from '../../jobs/src/market-cache';
import { quoteSchema } from '../../shared/quote';
import { historicalObservations } from '../../shared/historical-series';
import { ProviderError } from '../../jobs/src/alpha-vantage';
import { NasdaqReferences } from '../../jobs/src/nasdaq';

const projectId = 'demo-eazyinvest';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('These tests require local emulators.');
const admin = initializeAdmin({ projectId }, 'spark-test');
const clients = ['owner', 'stranger', 'anonymous', 'writer'].map((name) => {
  const app = initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-app' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db };
});
let ownerUid: string;
beforeAll(async () => {
  const owner = await createUserWithEmailAndPassword(
    clients[0].auth,
    `owner-${Date.now()}@example.test`,
    'emulator-password-123',
  );
  ownerUid = owner.user.uid;
  await createUserWithEmailAndPassword(
    clients[1].auth,
    `stranger-${Date.now()}@example.test`,
    'emulator-password-123',
  );
  const writer = await createUserWithEmailAndPassword(
    clients[3].auth,
    `writer-${Date.now()}@example.test`,
    'emulator-password-123',
  );
  await adminFirestore(admin)
    .doc('config/access')
    .set({ ownerUid, marketWriterUid: writer.user.uid });
  await adminFirestore(admin)
    .doc('market/vwce')
    .set({ ...demoMarket().vwce, source: 'Twelve Data' });
});
afterAll(async () => {
  for (const client of clients) {
    await terminate(client.db);
    await deleteApp(client.app);
  }
  await deleteAdmin(admin);
});
describe('Spark workspace persistence', () => {
  it('loads the whole catalogue across bounded pages and stores free Danish history through the restricted writer', async () => {
    await seedRegistry(clients[3].db);
    const registry = await loadRegistry(clients[0].db);
    expect(registry.length).toBeGreaterThan(150);
    expect(registry.find((item) => item.id === 'novo')?.yahooSymbol).toBe('NOVO-B.CO');
    const listing = registry.find((item) => item.yahooSymbol === 'DANSKE.CO')!;
    await queueHistory(clients[0].db, listing.id);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    await processRequests(
      clients[3].db,
      '',
      async () => {
        throw new Error('Free history must not consume Alpha Vantage credits');
      },
      async (item) =>
        parseYahooSeries(
          {
            chart: {
              error: null,
              result: [
                {
                  meta: {
                    symbol: item.yahooSymbol,
                    currency: 'DKK',
                    exchangeName: 'CPH',
                    instrumentType: 'EQUITY',
                    exchangeTimezoneName: 'Europe/Copenhagen',
                    regularMarketTime: Math.floor(now.getTime() / 1000),
                    regularMarketPrice: 300,
                  },
                  timestamp: [Date.parse(`${today}T00:00:00Z`) / 1000],
                  indicators: { quote: [{ close: [300] }], adjclose: [{ adjclose: [300] }] },
                },
              ],
            },
          },
          item,
          [],
          now,
        ),
      'history',
    );
    expect(await loadMarket(clients[0].db, listing.id, registry)).toMatchObject({
      source: 'Yahoo Finance',
      currency: 'DKK',
      providerSymbol: 'DANSKE.CO',
    });
    expect(
      (await adminFirestore(admin).doc(`marketRequests/${listing.id}`).get()).data()?.status,
    ).toBe('ready');
  });
  it('rejects anonymous and unrelated users', async () => {
    for (const client of clients.slice(1, 3)) {
      await expect(loadWorkspace(client.db, ownerUid)).rejects.toMatchObject({
        code: 'permission-denied',
      });
      await expect(saveWorkspace(client.db, ownerUid, emptyWorkspace(), 0)).rejects.toMatchObject({
        code: 'permission-denied',
      });
      await expect(loadMarket(client.db, 'vwce')).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
  });
  it('saves once, rejects stale revisions, and keeps the saved data', async () => {
    const db = clients[0].db;
    const data = { ...emptyWorkspace(), name: 'Spark workspace' };
    expect(await saveWorkspace(db, ownerUid, data, 0)).toMatchObject({ data, revision: 1 });
    await expect(
      saveWorkspace(db, ownerUid, { ...data, name: 'Stale tab' }, 0),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(await loadWorkspace(db, ownerUid)).toMatchObject({ data, revision: 1 });
  });
  it('validates full ledger semantics before writing', async () => {
    const data = {
      ...emptyWorkspace(),
      transactions: [
        {
          id: 'invalid-sale',
          date: '2025-01-01',
          instrumentId: 'vwce' as const,
          type: 'sell' as const,
          quantity: 1,
          price: 100,
          fx: 7.46,
          fees: 0,
          note: '',
        },
      ],
    };
    await expect(saveWorkspace(clients[0].db, ownerUid, data, 1)).rejects.toThrow('exceeds');
    expect((await loadWorkspace(clients[0].db, ownerUid))?.revision).toBe(1);
  });
  it('returns only provider cache and leaves missing data missing', async () => {
    expect(await loadMarket(clients[0].db, 'vwce')).toMatchObject({
      source: 'Twelve Data',
      instrumentId: 'vwce',
    });
    expect(await loadMarket(clients[0].db, 'msft')).toBeNull();
  });
  it('persists a saved preferred strategy with revision conflict protection', async () => {
    const current = (await loadWorkspace(clients[0].db, ownerUid))!;
    const strategy = {
      id: 'integration-strategy',
      name: 'My strategy',
      allocations: [{ instrumentId: 'eunl', weight: 100 }],
      initial: 0,
      monthly: 2000,
      goal: 100000,
      account: 'none' as const,
      rebalance: 'annual' as const,
      note: 'Research notes',
      startMonth: null,
      endMonth: null,
    };
    const data = { ...current.data, strategies: [strategy], preferredStrategyId: strategy.id };
    await saveWorkspace(clients[0].db, ownerUid, data, current.revision);
    expect((await loadWorkspace(clients[0].db, ownerUid))?.data).toEqual(data);
    await expect(loadWorkspace(clients[3].db, ownerUid)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
  it('completes a real owner search/history queue through the restricted writer', async () => {
    await seedRegistry(clients[3].db);
    expect(instruments.length).toBeGreaterThan(6);
    const pending = await searchMarkets(clients[0].db, 'IBM');
    expect(pending.status).toBe('pending');
    let credits = 0;
    const originalFetch = globalThis.fetch;
    const fake = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).startsWith('https://www.alphavantage.co/'))
        return new Response(
          JSON.stringify({
            bestMatches: [
              {
                '1. symbol': 'IBM',
                '2. name': 'International Business Machines',
                '3. type': 'Equity',
                '4. region': 'United States',
                '8. currency': 'USD',
              },
            ],
          }),
          { status: 200 },
        );
      return originalFetch(input, init);
    });
    try {
      await processRequests(
        clients[3].db,
        'fake-test-key',
        async () => {
          credits++;
        },
        async () => {
          throw new Error('Unexpected history request');
        },
        'search',
      );
      const found = await searchMarkets(clients[0].db, 'IBM');
      expect(found.status).toBe('ready');
      expect(found.results?.[0].id).toBe('av-ibm');
      expect(credits).toBe(1);
      const request = await queueHistory(clients[0].db, 'av-ibm');
      expect(request.status).toBe('pending');
      await processRequests(
        clients[3].db,
        'fake-test-key',
        async () => {
          credits++;
        },
        async (item) => ({
          ...demoMarket().msft,
          instrumentId: item.id,
          source: 'Alpha Vantage',
          providerSymbol: 'IBM',
          frequency: 'monthly',
          adjustment: 'splits-and-dividends',
          fxSource: 'ECB',
          fetchedAt: new Date().toISOString(),
          quote: { date: '2026-10-02', close: 100 },
          points: demoMarket().msft.points.map((p) => ({ ...p, adjustedClose: p.close })),
        }),
        'history',
      );
      expect((await adminFirestore(admin).doc('marketRequests/av-ibm').get()).data()?.status).toBe(
        'ready',
      );
      expect(
        await loadMarket(clients[0].db, 'av-ibm', [...instruments, ...found.results!]),
      ).toMatchObject({ instrumentId: 'av-ibm', providerSymbol: 'IBM' });
    } finally {
      fake.mockRestore();
    }
  });
  it('shares the daily provider budget between separate job instances', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await adminFirestore(admin)
      .doc('marketSync/budget')
      .set({ day, used: 24, lastRequestAt: Date.now() - 20000 });
    await dailyAllowance(clients[3].db)();
    expect((await adminFirestore(admin).doc('marketSync/budget').get()).data()?.used).toBe(25);
    await expect(dailyAllowance(clients[3].db)()).rejects.toThrow('quota');
  });
  it('prioritizes new history and rotates completed requests rather than starving later listings', async () => {
    const db = adminFirestore(admin);
    const cached = (id: string, symbol: string) => ({
      ...demoMarket().msft,
      instrumentId: id,
      source: 'Alpha Vantage' as const,
      providerSymbol: symbol,
      adjustment: 'splits-and-dividends' as const,
      fxSource: 'ECB' as const,
      fetchedAt: new Date().toISOString(),
      quote: { date: '2026-10-02', close: 100 },
      points: demoMarket().msft.points.map((p) => ({ ...p, adjustedClose: p.close })),
    });
    for (const [id, symbol, completedAt] of [
      ['av-aapl', 'AAPL', '2020-01-01T00:00:00.000Z'],
      ['av-nvda', 'NVDA', '2021-01-01T00:00:00.000Z'],
      ['av-googl', 'GOOGL', '2022-01-01T00:00:00.000Z'],
    ]) {
      await db.doc(`market/${id}`).set(cached(id, symbol));
      await db
        .doc(`marketRequests/${id}`)
        .set({ instrumentId: id, requestedAt: completedAt, completedAt, status: 'ready' });
    }
    await queueHistory(clients[0].db, 'av-amzn');
    const fetches: string[] = [];
    const fetchSeries = async (item: (typeof instruments)[number]) => {
      fetches.push(item.id);
      return cached(item.id, item.providerSymbol!);
    };
    await processRequests(
      clients[3].db,
      'fake-test-key',
      async () => {
        throw new Error('Unexpected provider search');
      },
      fetchSeries,
      'history',
    );
    expect(fetches).toEqual(['av-amzn']);
    expect((await db.doc('marketRequests/av-amzn').get()).data()?.status).toBe('ready');
    expect((await db.doc('marketRequests/av-aapl').get()).data()?.completedAt).not.toBe(
      '2020-01-01T00:00:00.000Z',
    );
    expect((await db.doc('marketRequests/av-nvda').get()).data()?.completedAt).toBe(
      '2021-01-01T00:00:00.000Z',
    );
    await processRequests(
      clients[3].db,
      'fake-test-key',
      async () => {
        throw new Error('Unexpected provider search');
      },
      fetchSeries,
      'history',
    );
    expect((await db.doc('marketRequests/av-nvda').get()).data()?.completedAt).not.toBe(
      '2021-01-01T00:00:00.000Z',
    );
    expect((await db.doc('marketRequests/av-googl').get()).data()?.completedAt).not.toBe(
      '2022-01-01T00:00:00.000Z',
    );
    expect(fetches).toEqual(['av-amzn']);
  });
  it('refreshes daily raw quotes while leaving weekly history bytes and adjusted returns unchanged', async () => {
    const item = instruments.find((entry) => entry.id === 'novo')!;
    const now = new Date('2026-10-04T12:00:00Z');
    const series = {
      ...demoMarket().novo,
      source: 'Yahoo Finance',
      providerSymbol: 'NOVO-B.CO',
      fetchedAt: '2026-10-03T12:00:00.000Z',
      adjustment: 'splits-and-dividends',
      closeAdjustment: 'splits',
      fxSource: 'ECB',
      fxDate: '2026-10-02',
      quote: { date: '2026-10-02', close: 300 },
      points: [
        { date: '2026-08-31', close: 100, adjustedClose: 90, fxToDkk: 1, fxDate: '2026-08-31' },
        { date: '2026-09-30', close: 120, adjustedClose: 110, fxToDkk: 1, fxDate: '2026-09-30' },
      ],
    };
    await adminFirestore(admin).doc('market/novo').set(series);
    const original = (await adminFirestore(admin).doc('market/novo').get()).data();
    const fetchHistory = vi.fn(async () => {
      throw new Error('A daily quote must not redownload fresh history');
    });
    const fetchQuote = vi.fn(async () =>
      quoteSchema.parse({
        instrumentId: 'novo',
        currency: 'DKK',
        source: 'Yahoo Finance',
        providerSymbol: 'NOVO-B.CO',
        fetchedAt: now.toISOString(),
        quote: { date: '2026-10-02', close: 330 },
        fxToDkk: 1,
        fxDate: '2026-10-02',
        fxSource: 'ECB',
      }),
    );
    expect(
      await refreshInstrument(clients[3].db, item, [], new Map(), fetchHistory, fetchQuote, now),
    ).toMatchObject({ historyUpdated: false, quoteUpdated: true, failed: 0 });
    const after = (await adminFirestore(admin).doc('market/novo').get()).data();
    expect(after).toEqual(original);
    expect(
      historicalObservations(
        (await loadMarket(clients[0].db, 'novo')) ?? undefined,
        'DKK',
      ).points.map((p) => p.value),
    ).toEqual([90, 110]);
    expect(
      (await loadQuotes(clients[0].db)).find((quote) => quote.instrumentId === 'novo')?.quote.close,
    ).toBe(330);
    await refreshInstrument(clients[3].db, item, [], new Map(), fetchHistory, fetchQuote, now);
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });
  it('keeps quote and history failures independent and clears cancelled references despite failed history retrieval', async () => {
    const item = instruments.find((entry) => entry.id === 'novo')!;
    const db = adminFirestore(admin);
    const previous = (await db.doc('market/novo').get()).data()!;
    await db.doc('market/novo').set({
      ...previous,
      fetchedAt: '2026-09-20T12:00:00.000Z',
      reportedTrade: {
        source: 'Nasdaq Nordic',
        dateTime: '2026-10-02T14:55:00.000Z',
        close: 301,
        isin: item.isin,
        mic: 'XCSE',
        reportFile: 'NordicEquity-posttrade-2026-10-02T1655',
        fetchedAt: '2026-10-04T12:00:00.000Z',
        transactionId: 'cancel-me',
      },
    });
    const references = new NasdaqReferences();
    references.invalidated.add('XCSE:cancel-me');
    const now = new Date('2026-10-05T12:00:00Z');
    const next = quoteSchema.parse({
      ...(await db.doc('marketQuotes/novo').get()).data(),
      fetchedAt: now.toISOString(),
      quote: { date: '2026-10-05', close: 340 },
      fxDate: '2026-10-05',
    });
    const unavailable = async () => {
      throw new ProviderError('unavailable');
    };
    const result = await refreshInstrument(
      clients[3].db,
      item,
      [],
      references,
      unavailable,
      async () => next,
      now,
    );
    expect(result).toMatchObject({ failed: 1, quoteUpdated: true, historyUpdated: false });
    expect((await db.doc('market/novo').get()).data()).toMatchObject({
      fetchedAt: '2026-09-20T12:00:00.000Z',
      points: previous.points,
    });
    expect((await db.doc('market/novo').get()).data()?.reportedTrade).toBeUndefined();
    expect((await db.doc('marketQuotes/novo').get()).data()?.quote.close).toBe(340);
    await db.doc('market/novo').set({ ...previous, fetchedAt: '2026-10-05T12:00:00.000Z' });
    const later = new Date('2026-10-06T12:00:00Z');
    expect(
      await refreshInstrument(clients[3].db, item, [], new Map(), unavailable, unavailable, later),
    ).toMatchObject({ failed: 1, quoteUpdated: false });
    expect((await db.doc('marketQuotes/novo').get()).data()?.quote.close).toBe(340);
    await expect(
      refreshInstrument(
        clients[3].db,
        item,
        [],
        new Map(),
        unavailable,
        async () => {
          throw new ProviderError('quota');
        },
        later,
      ),
    ).rejects.toMatchObject({ reason: 'quota' });
  });
  it('pages lightweight quotes and excludes malformed or substituted rows without reading histories', async () => {
    const db = adminFirestore(admin);
    const selected = instruments.filter((item) => yahooSymbol(item)).slice(0, 120);
    for (const item of selected)
      await db.doc(`marketQuotes/${item.id}`).set(
        quoteSchema.parse({
          instrumentId: item.id,
          currency: item.currency,
          source: 'Yahoo Finance',
          providerSymbol: yahooSymbol(item),
          fetchedAt: '2026-10-04T12:00:00.000Z',
          quote: { date: '2026-10-02', close: 100 },
          fxToDkk: item.currency === 'DKK' ? 1 : 7.46,
          fxDate: '2026-10-02',
          fxSource: 'ECB',
        }),
      );
    await db.doc('marketQuotes/bad').set({ instrumentId: 'bad', points: [] });
    const quotes = await loadQuotes(clients[0].db);
    expect(quotes.length).toBeGreaterThanOrEqual(120);
    expect(quotes.some((item) => item.instrumentId === 'bad')).toBe(false);
    expect(quotes.every((item) => !('points' in item))).toBe(true);
  });
});
