import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
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
      { ...emptyWorkspace(), watchlist: Array(7).fill({}) },
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
});
