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
  await getFirestore(admin)
    .doc('market/msft')
    .set({
      instrumentId: 'msft',
      currency: 'USD',
      source: 'Alpha Vantage',
      providerSymbol: 'MSFT',
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      fetchedAt: '2026-10-04T10:00:00.000Z',
      fxToDkk: 6,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 260 },
      points: [
        { date: '2006-09-29', close: 100, adjustedClose: 25, fxToDkk: 6, fxDate: '2006-09-29' },
        { date: '2008-09-30', close: 100, adjustedClose: 20, fxToDkk: 6, fxDate: '2008-09-30' },
        { date: '2025-09-30', close: 200, adjustedClose: 40, fxToDkk: 6, fxDate: '2025-09-30' },
        { date: '2026-09-30', close: 250, adjustedClose: 50, fxToDkk: 6, fxDate: '2026-09-30' },
      ],
    });
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

test('private historical analysis distinguishes adjusted returns from the current quote', async ({
  page,
}) => {
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore?investment=msft');
  await expect(page.getByText('Adjusted monthly history in DKK')).toBeVisible();
  await expect(page.getByRole('button', { name: '20Y', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.detail-metrics').nth(0)).toContainText('260');
  await expect(page.getByText(/Showing .*2006.*2026/)).toBeVisible();
  await expect(page.getByText('Period adjusted return').locator('..')).toContainText('100');
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await expect(page.getByText('Period adjusted return').locator('..')).toContainText('25');
  await expect(page.locator('.source-line')).toContainText('ECB');
  await expect(page.getByText(/This period has a missing monthly observation/)).toBeVisible();
  await page.getByRole('button', { name: 'Trading currency', exact: true }).click();
  await expect(page.getByText('Adjusted monthly history in USD')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    audit.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
});

test('dated DKK returns feed holding statistics and monthly saving without changing raw quotes', async ({
  page,
}) => {
  await getFirestore(admin)
    .doc('market/eunl')
    .set({
      instrumentId: 'eunl',
      currency: 'EUR',
      source: 'Alpha Vantage',
      providerSymbol: 'EUNL.DEX',
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      fetchedAt: '2026-10-04T10:00:00.000Z',
      fxToDkk: 8,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 999 },
      points: [
        { date: '2025-01-31', close: 100, adjustedClose: 100, fxToDkk: 6, fxDate: '2025-01-31' },
        { date: '2025-02-28', close: 100, adjustedClose: 100, fxToDkk: 7, fxDate: '2025-02-28' },
        { date: '2025-03-31', close: 100, adjustedClose: 100, fxToDkk: 8, fxDate: '2025-03-31' },
      ],
    });
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore?investment=eunl');
  await expect(page.getByText('Adjusted monthly history in DKK')).toBeVisible();
  await expect(page.locator('.detail-metrics').first()).toContainText('999');
  await expect(page.locator('.holding-summary')).toContainText('+33,3%');
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('3.000');
  // 1000 at 600; grow to 700 then add 1000; grow to 800 then add 1000 = 3476.19.
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('3.476');
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('476');
  await page.getByRole('button', { name: 'Trading currency', exact: true }).click();
  await expect(page.locator('.holding-summary')).toContainText('0%');
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('3.476');
  await page.getByRole('button', { name: 'Show monthly saving values' }).click();
  await expect(page.locator('.historical-savings tbody tr')).toHaveCount(3);
  await page.getByLabel('Historical monthly contribution (DKK)', { exact: true }).fill('2000');
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('6.952');
  await page.getByLabel('Saving start month').selectOption('2025-02');
  await expect(page.locator('.historical-savings .result-breakdown')).toContainText('4.286');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    audit.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
});
