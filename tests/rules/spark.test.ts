import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import { getInstrument } from '../../shared/catalog';
import { emptyWorkspace, demoMarket } from '../../src/lib/demo';
let env: RulesTestEnvironment;
const workspace = () => ({ revision: 1, data: emptyWorkspace() });
const market = () => ({ ...demoMarket().vwce, source: 'Twelve Data' });
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-eazyinvest',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'config/access'), {
      ownerUid: 'owner',
      marketWriterUid: 'writer',
    });
    await setDoc(doc(context.firestore(), 'users/owner/workspace/current'), workspace());
    await setDoc(doc(context.firestore(), 'market/vwce'), market());
  });
});
afterAll(async () => {
  await env?.cleanup();
});
describe('Spark owner and market-writer boundaries', () => {
  it('allows owner reads and a sequential workspace update', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/owner/workspace/current')));
    await assertSucceeds(getDoc(doc(db, 'market/vwce')));
    await assertSucceeds(
      setDoc(doc(db, 'users/owner/workspace/current'), { ...workspace(), revision: 2 }),
    );
  });
  it('requires initial revision one and rejects stale or skipped revisions', async () => {
    const db = env.authenticatedContext('owner').firestore();
    const ref = doc(db, 'users/owner/workspace/current');
    await assertFails(setDoc(ref, workspace()));
    await assertFails(setDoc(ref, { ...workspace(), revision: 3 }));
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), ref.path)));
    await assertFails(setDoc(ref, { ...workspace(), revision: 2 }));
    await assertSucceeds(setDoc(ref, workspace()));
  });
  it('denies all personal data access to strangers and anonymous visitors', async () => {
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext('stranger')]) {
      const db = context.firestore();
      await assertFails(getDoc(doc(db, 'users/owner/workspace/current')));
      await assertFails(
        setDoc(doc(db, 'users/owner/workspace/current'), { ...workspace(), revision: 2 }),
      );
      await assertFails(getDoc(doc(db, 'market/vwce')));
      await assertFails(setDoc(doc(db, 'market/vwce'), market()));
    }
  });
  it('rejects malformed plans, unknown fields, and oversized collections', async () => {
    const db = env.authenticatedContext('owner').firestore();
    for (const data of [
      { ...emptyWorkspace(), plan: { ...emptyWorkspace().plan, years: 1000 } },
      { ...emptyWorkspace(), plan: { ...emptyWorkspace().plan, monthly: -1 } },
      { ...emptyWorkspace(), transactions: Array(501).fill({}) },
      { ...emptyWorkspace(), watchlist: Array(31).fill({}) },
      { ...emptyWorkspace(), strategies: Array(11).fill({}) },
      { ...emptyWorkspace(), name: '' },
      { ...emptyWorkspace(), surprise: true },
    ])
      await assertFails(setDoc(doc(db, 'users/owner/workspace/current'), { revision: 2, data }));
  });
  it('blocks other user paths, lists, and direct deletes', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertFails(getDoc(doc(db, 'users/stranger/workspace/current')));
    await assertFails(setDoc(doc(db, 'users/stranger/workspace/current'), workspace()));
    await assertFails(getDocs(collection(db, 'market')));
    await assertFails(deleteDoc(doc(db, 'users/owner/workspace/current')));
  });
  it('allows writer price updates but no access to personal workspace data', async () => {
    const db = env.authenticatedContext('writer').firestore();
    await assertSucceeds(getDoc(doc(db, 'market/vwce')));
    await assertSucceeds(setDoc(doc(db, 'market/vwce'), market()));
    await assertFails(getDoc(doc(db, 'users/owner/workspace/current')));
    await assertFails(
      setDoc(doc(db, 'users/owner/workspace/current'), { ...workspace(), revision: 2 }),
    );
    await assertFails(getDocs(collection(db, 'market')));
  });
  it('rejects unknown market IDs, demo data, malformed quotes and owner price writes', async () => {
    const db = env.authenticatedContext('writer').firestore();
    await assertFails(setDoc(doc(db, 'market/unknown'), { ...market(), instrumentId: 'unknown' }));
    await assertFails(setDoc(doc(db, 'market/vwce'), { ...market(), source: 'demo' }));
    await assertFails(setDoc(doc(db, 'market/vwce'), { ...market(), fxToDkk: -1 }));
    await assertFails(setDoc(doc(db, 'market/vwce'), { ...market(), points: [] }));
    await assertFails(
      setDoc(doc(env.authenticatedContext('owner').firestore(), 'market/vwce'), market()),
    );
  });
  it('never permits reading or changing the owner/writer allowlist', async () => {
    for (const uid of ['owner', 'writer', 'stranger']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'config/access')));
      await assertFails(setDoc(doc(db, 'config/access'), { ownerUid: uid, marketWriterUid: uid }));
    }
  });
  it('accepts dated FX or legacy endpoints and rejects incomplete or invalid FX pairs', async () => {
    const db = env.authenticatedContext('writer').firestore();
    const ref = doc(db, 'market/vwce');
    const valid = market();
    await assertSucceeds(setDoc(ref, valid));
    const legacy = {
      ...valid,
      points: valid.points.map(({ fxToDkk: _fx, fxDate: _date, ...point }) => point),
    };
    await assertSucceeds(setDoc(ref, legacy));
    for (const endpoint of [0, valid.points.length - 1]) {
      for (const change of [{ fxDate: null }, { fxToDkk: -1 }, { fxToDkk: '7.46' }]) {
        const points = valid.points.map((point, index) =>
          index === endpoint ? { ...point, ...change } : point,
        );
        await assertFails(setDoc(ref, { ...valid, points }));
      }
    }
    const native = { ...demoMarket().novo, source: 'Twelve Data' };
    await assertSucceeds(setDoc(doc(db, 'market/novo'), native));
    await assertFails(
      setDoc(doc(db, 'market/novo'), {
        ...native,
        points: native.points.map((point, index) =>
          index === 0 ? { ...point, fxToDkk: 2 } : point,
        ),
      }),
    );
  });
  it('accepts verified monthly history only with the exact listing, currency and separate quote', async () => {
    const db = env.authenticatedContext('writer').firestore();
    const monthly = {
      ...market(),
      source: 'Alpha Vantage',
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      providerSymbol: 'VWCE.DEX',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 100 },
    };
    await assertSucceeds(setDoc(doc(db, 'market/vwce'), monthly));
    for (const change of [
      { providerSymbol: 'VWCE.GER' },
      { currency: 'USD' },
      { frequency: 'daily' },
      { quote: { date: '2026-10-02', close: -1 } },
    ])
      await assertFails(setDoc(doc(db, 'market/vwce'), { ...monthly, ...change }));
    const { quote: _quote, ...withoutQuote } = monthly;
    await assertFails(setDoc(doc(db, 'market/vwce'), withoutQuote));
  });
  it('fails closed when the administrative allowlist is absent', async () => {
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), 'config/access')));
    for (const uid of ['owner', 'writer']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'market/vwce')));
      await assertFails(
        setDoc(doc(db, 'users/owner/workspace/current'), { ...workspace(), revision: 2 }),
      );
    }
  });
  it('limits registry writes to the writer and binds new market data to its listing', async () => {
    const writer = env.authenticatedContext('writer').firestore();
    const owner = env.authenticatedContext('owner').firestore();
    const definition = {
      ...getInstrument('msft'),
      id: 'av-ibm',
      ticker: 'IBM',
      name: 'IBM',
      providerSymbol: 'IBM',
    };
    await assertSucceeds(setDoc(doc(writer, 'instrumentRegistry/av-ibm'), definition));
    await assertSucceeds(getDocs(query(collection(owner, 'instrumentRegistry'), limit(100))));
    await assertFails(getDocs(collection(owner, 'instrumentRegistry')));
    await assertFails(setDoc(doc(owner, 'instrumentRegistry/av-ibm'), definition));
    await assertFails(setDoc(doc(writer, 'instrumentRegistry/other'), definition));
    const data = {
      ...demoMarket().msft,
      instrumentId: 'av-ibm',
      source: 'Alpha Vantage',
      providerSymbol: 'IBM',
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 100 },
    };
    await assertSucceeds(setDoc(doc(writer, 'market/av-ibm'), data));
    await assertFails(setDoc(doc(writer, 'market/av-ibm'), { ...data, providerSymbol: 'MSFT' }));
    await assertFails(setDoc(doc(writer, 'market/av-ibm'), { ...data, currency: 'EUR' }));
  });
  it('allows owner queue creation and writer completion without owner status forgery', async () => {
    const writer = env.authenticatedContext('writer').firestore();
    const owner = env.authenticatedContext('owner').firestore();
    const id = 'a'.repeat(64);
    const initial = { query: 'ibm', requestedAt: '2026-10-04T10:00:00.000Z', status: 'pending' };
    await assertSucceeds(setDoc(doc(owner, 'discoveryRequests', id), initial));
    await assertFails(
      setDoc(doc(owner, 'discoveryRequests', id), { ...initial, status: 'ready', results: [] }),
    );
    await assertSucceeds(
      setDoc(doc(writer, 'discoveryRequests', id), {
        ...initial,
        status: 'ready',
        results: [],
        completedAt: '2026-10-04T10:01:00.000Z',
      }),
    );
    await assertFails(
      setDoc(doc(writer, 'discoveryRequests', id), {
        ...initial,
        query: 'changed',
        status: 'ready',
      }),
    );
    await assertSucceeds(setDoc(doc(owner, 'discoveryRequests', id), initial));
    await assertFails(
      getDoc(doc(env.authenticatedContext('stranger').firestore(), 'discoveryRequests', id)),
    );
    await assertFails(getDocs(query(collection(owner, 'discoveryRequests'), limit(3))));
    await assertSucceeds(getDocs(query(collection(writer, 'discoveryRequests'), limit(3))));
    await assertFails(
      setDoc(doc(owner, 'marketRequests/unknown'), {
        instrumentId: 'unknown',
        requestedAt: initial.requestedAt,
        status: 'pending',
      }),
    );
    await assertSucceeds(
      setDoc(doc(writer, 'instrumentRegistry/msft'), {
        ...getInstrument('msft'),
        providerSymbol: 'MSFT',
      }),
    );
    await assertSucceeds(
      setDoc(doc(owner, 'marketRequests/msft'), {
        instrumentId: 'msft',
        requestedAt: initial.requestedAt,
        status: 'pending',
      }),
    );
    await assertFails(
      setDoc(doc(owner, 'marketRequests/msft'), {
        instrumentId: 'msft',
        requestedAt: initial.requestedAt,
        status: 'ready',
      }),
    );
  });
  it('protects the persistent free-request budget from owners and unrelated accounts', async () => {
    const writer = env.authenticatedContext('writer').firestore();
    const budget = { day: '2026-10-04', used: 1, lastRequestAt: 1791108000000 };
    await assertSucceeds(setDoc(doc(writer, 'marketSync/budget'), budget));
    await assertFails(setDoc(doc(writer, 'marketSync/budget'), { ...budget, used: 26 }));
    for (const uid of ['owner', 'stranger']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'marketSync/budget')));
      await assertFails(setDoc(doc(db, 'marketSync/budget'), budget));
    }
  });
});
