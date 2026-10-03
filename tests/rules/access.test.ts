import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-eazyinvest',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'config/access'), { ownerUid: 'owner' });
    await setDoc(doc(context.firestore(), 'users/owner/workspace/current'), { revision: 1 });
    await setDoc(doc(context.firestore(), 'market/vwce'), { source: 'test' });
  });
});
afterAll(async () => {
  await env?.cleanup();
});
describe('owner-only Firestore boundary', () => {
  it('allows the owner to read their workspace and market cache', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/owner/workspace/current')));
    await assertSucceeds(getDoc(doc(db, 'market/vwce')));
  });
  it('blocks signed-out and other authenticated users', async () => {
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext('stranger')]) {
      await assertFails(getDoc(doc(context.firestore(), 'users/owner/workspace/current')));
      await assertFails(getDoc(doc(context.firestore(), 'market/vwce')));
    }
  });
  it('blocks reading another users path, listing, and all client writes', async () => {
    const db = env.authenticatedContext('owner').firestore();
    await assertFails(getDoc(doc(db, 'users/stranger/workspace/current')));
    await assertFails(getDocs(collection(db, 'market')));
    await assertFails(setDoc(doc(db, 'users/owner/workspace/current'), { revision: 2 }));
    await assertFails(setDoc(doc(db, 'market/vwce'), { price: 0 }));
  });
  it('does not expose or permit changes to the owner allowlist and quotas', async () => {
    for (const uid of ['owner', 'stranger']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'config/access')));
      await assertFails(setDoc(doc(db, 'config/access'), { ownerUid: uid }));
      await assertFails(setDoc(doc(db, 'internal/providerQuota'), { dailyCount: 0 }));
    }
  });
});
