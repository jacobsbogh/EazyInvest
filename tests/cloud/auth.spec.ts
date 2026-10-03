import { test, expect, type Page } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import AxeBuilder from '@axe-core/playwright';

if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
) {
  throw new Error('Cloud browser tests require the local Auth and Firestore emulators.');
}
const admin = initializeApp({ projectId: 'demo-eazyinvest' }, 'cloud-browser-tests');
const ownerEmail = 'browser-owner@example.test';
const strangerEmail = 'browser-stranger@example.test';
const emulatorPassword = 'emulator-password-123';
let ownerUid: string;

test.beforeAll(async () => {
  await getAuth(admin).deleteUsers(['browser-owner', 'browser-stranger']);
  for (const email of [ownerEmail, strangerEmail]) {
    const uid = email.split('@')[0];
    await getAuth(admin).createUser({ uid, email, password: emulatorPassword });
    if (email === ownerEmail) ownerUid = uid;
  }
  await getFirestore(admin).doc('config/access').set({ ownerUid });
  await getFirestore(admin).doc(`users/${ownerUid}/workspace/current`).delete();
});
test.afterAll(async () => {
  await deleteApp(admin);
});

async function signIn(page: Page, email: string, password = emulatorPassword) {
  await page.goto('./');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('#main-content')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('another password account cannot open the private workspace', async ({ page }) => {
  await signIn(page, strangerEmail);
  await expect(page.getByRole('alert')).toContainText('This account does not have access');
  await expect(page.locator('#main-content')).toHaveCount(0);
  await expect(page.getByText('My private browser test', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('invalid credentials keep the workspace closed and allow a retry', async ({ page }) => {
  await signIn(page, ownerEmail, 'incorrect-emulator-password');
  await expect(page.getByRole('alert')).toHaveText(
    'The email or password is incorrect. Please try again.',
  );
  await expect(page.locator('#main-content')).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByLabel('Password', { exact: true }).fill(emulatorPassword);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
});

test('password sign-in is accessible and fits desktop and mobile screens', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`sign-in-${viewport.width}.png`),
      fullPage: true,
    });
  }
});
