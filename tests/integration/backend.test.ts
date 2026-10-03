import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { emptyWorkspace, demoMarket } from '../../src/lib/demo';
const projectId = 'demo-eazyinvest';
const admin = initializeAdmin({ projectId }, 'backend-test');
const clients = ['owner', 'stranger', 'anonymous'].map((name) => {
  const app = initializeApp(
    { projectId, apiKey: 'demo-key', appId: 'demo-app', authDomain: 'localhost' },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { app, auth, functions };
});
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error('Backend tests require the local emulator.');
  const owner = await createUserWithEmailAndPassword(
    clients[0].auth,
    `owner-${Date.now()}@example.test`,
    'emulator-password-123',
  );
  await createUserWithEmailAndPassword(
    clients[1].auth,
    `stranger-${Date.now()}@example.test`,
    'emulator-password-123',
  );
  await getFirestore(admin).doc('config/access').set({ ownerUid: owner.user.uid });
  // A cached live-shaped fixture avoids making any provider network request.
  await getFirestore(admin)
    .doc('market/vwce')
    .set({ ...demoMarket().vwce, source: 'Twelve Data', fetchedAt: new Date().toISOString() });
});
afterAll(async () => {
  await Promise.all(clients.map((client) => deleteApp(client.app)));
  await deleteAdmin(admin);
});
describe('callable authorization and validated persistence', () => {
  it('rejects anonymous and unrelated users before any provider access', async () => {
    for (const [index, code] of [
      [2, 'functions/unauthenticated'],
      [1, 'functions/permission-denied'],
    ] as const) {
      await expect(
        httpsCallable(
          clients[index].functions,
          'saveWorkspace',
        )({ data: emptyWorkspace(), revision: 0 }),
      ).rejects.toMatchObject({ code });
      await expect(
        httpsCallable(clients[index].functions, 'getMarketSeries')({ instrumentId: 'vwce' }),
      ).rejects.toMatchObject({ code });
    }
  });
  it('saves once, rejects stale revisions, and preserves the saved data', async () => {
    const save = httpsCallable(clients[0].functions, 'saveWorkspace');
    const data = { ...emptyWorkspace(), name: 'Cloud test workspace' };
    const result = await save({ data, revision: 0 });
    expect(result.data).toMatchObject({ data, revision: 1 });
    await expect(save({ data: { ...data, name: 'Stale tab' }, revision: 0 })).rejects.toMatchObject(
      { code: 'functions/aborted' },
    );
    const stored = await getFirestore(admin)
      .doc(`users/${clients[0].auth.currentUser!.uid}/workspace/current`)
      .get();
    expect(stored.data()?.data.name).toBe('Cloud test workspace');
  });
  it('rejects malformed plans and overselling on the server', async () => {
    const save = httpsCallable(clients[0].functions, 'saveWorkspace');
    await expect(
      save({
        data: { ...emptyWorkspace(), plan: { ...emptyWorkspace().plan, years: 1000 } },
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(
      save({
        data: {
          ...emptyWorkspace(),
          transactions: [
            {
              id: 'invalid-sale',
              date: '2025-01-01',
              instrumentId: 'vwce',
              type: 'sell',
              quantity: 1,
              price: 100,
              fx: 7.46,
              fees: 0,
              note: '',
            },
          ],
        },
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
  it('returns cached data only for the owner and rejects arbitrary symbols', async () => {
    const load = httpsCallable(clients[0].functions, 'getMarketSeries');
    const result = await load({ instrumentId: 'vwce' });
    expect(result.data).toMatchObject({ instrumentId: 'vwce', source: 'Twelve Data' });
    await expect(load({ instrumentId: 'https://example.test' })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });
});
