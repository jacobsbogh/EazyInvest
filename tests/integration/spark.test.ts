import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { loadWorkspace, saveWorkspace, loadMarket } from '../../src/lib/cloud';
import { emptyWorkspace, demoMarket } from '../../src/lib/demo';

const projectId = 'demo-eazyinvest';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('These tests require local emulators.');
const admin = initializeAdmin({ projectId }, 'spark-test');
const clients = ['owner', 'stranger', 'anonymous'].map((name) => {
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
  await adminFirestore(admin).doc('config/access').set({ ownerUid, marketWriterUid: 'writer' });
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
  it('rejects anonymous and unrelated users', async () => {
    for (const client of clients.slice(1)) {
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
});
