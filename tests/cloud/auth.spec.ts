import { test, expect, type Page } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
) {
  throw new Error('Cloud browser tests require the local Auth and Firestore emulators.');
}
const admin = initializeApp({ projectId: 'demo-eazyinvest' }, 'cloud-browser-tests');
const ownerEmail = 'browser-owner@example.test';
const strangerEmail = 'browser-stranger@example.test';
let ownerUid: string;

test.beforeAll(async () => {
  await getAuth(admin).deleteUsers(['browser-owner', 'browser-stranger']);
  for (const email of [ownerEmail, strangerEmail]) {
    const uid = email.split('@')[0];
    const result = await getAuth(admin).importUsers([
      {
        uid,
        email,
        emailVerified: true,
        providerData: [{ providerId: 'google.com', uid: email, email, displayName: uid }],
      },
    ]);
    expect(result.errors).toEqual([]);
    if (email === ownerEmail) ownerUid = uid;
  }
  await getFirestore(admin).doc('config/access').set({ ownerUid });
  await getFirestore(admin).doc(`users/${ownerUid}/workspace/current`).delete();
});
test.afterAll(async () => {
  await deleteApp(admin);
});

async function signIn(page: Page, email: string) {
  await page.goto('./');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupPromise;
  // The emulator renders account rows before its CDN script attaches click handlers.
  // A visible row alone is not ready to receive a click on a cold CI browser.
  await popup.waitForLoadState('load');
  const closed = popup.waitForEvent('close');
  await popup.getByText(email, { exact: true }).last().click();
  await closed;
}

test('owner signs in, saves to Firestore, reloads, and signs out on a Pages subpath', async ({
  page,
}) => {
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings & data' }).click();
  await page.getByLabel('Workspace name').fill('My private browser test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace name saved');
  const stored = await getFirestore(admin).doc(`users/${ownerUid}/workspace/current`).get();
  expect(stored.data()?.data.name).toBe('My private browser test');
  expect(stored.data()?.revision).toBe(1);
  await page.reload();
  await expect(page.getByLabel('Workspace name')).toHaveValue('My private browser test');
  expect(new URL(page.url()).pathname).toBe('/EazyInvest/');
  expect(await page.evaluate(() => localStorage.getItem('eazyinvest.demo.v1'))).toBeNull();
  // The emulator injects a fixed bottom warning over this button. Keyboard activation
  // exercises the real sign-out handler without hiding that development warning.
  await page
    .getByRole('button', { name: /Private workspace Connected to Firebase/ })
    .press('Enter');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.locator('#main-content')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('another Google account cannot open the private workspace', async ({ page }) => {
  await signIn(page, strangerEmail);
  await expect(page.getByRole('alert')).toContainText('This account does not have access');
  await expect(page.locator('#main-content')).toHaveCount(0);
  await expect(page.getByText('My private browser test', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});
