import { test, expect, type Page } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import AxeBuilder from '@axe-core/playwright';
import { getInstrument } from '../../shared/catalog';
import { quoteSchema } from '../../shared/quote';

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

test('owner sees free Danish history and a separate dated Nasdaq reference', async ({ page }) => {
  const item = getInstrument('novo');
  await getFirestore(admin).doc('instrumentRegistry/novo').set(item);
  await getFirestore(admin)
    .doc('market/novo')
    .set({
      instrumentId: 'novo',
      currency: 'DKK',
      source: 'Yahoo Finance',
      providerSymbol: 'NOVO-B.CO',
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      closeAdjustment: 'splits',
      fetchedAt: '2026-10-04T10:00:00.000Z',
      fxToDkk: 1,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 300 },
      points: [
        { date: '2026-07-31', close: 200, adjustedClose: 180, fxToDkk: 1, fxDate: '2026-07-31' },
        { date: '2026-08-31', close: 250, adjustedClose: 225, fxToDkk: 1, fxDate: '2026-08-31' },
        { date: '2026-09-30', close: 300, adjustedClose: 300, fxToDkk: 1, fxDate: '2026-09-30' },
      ],
      reportedTrade: {
        source: 'Nasdaq Nordic',
        dateTime: '2026-10-02T14:55:00.000Z',
        close: 301,
        isin: item.isin,
        mic: 'XCSE',
        reportFile: 'NordicEquity-posttrade-2026-10-02T1655',
        fetchedAt: '2026-10-04T10:00:00.000Z',
      },
    });
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore');
  await page.getByRole('button', { name: 'View Novo Nordisk B', exact: true }).click();
  await expect(page.getByText('Yahoo Finance history: 2026-07-31 to 2026-09-30.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Nasdaq reported exchange trade', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.coverage-card').first()).toContainText('301');
  await expect(page.locator('.detail-metrics').first()).toContainText('300');
  await expect(page.locator('.source-line')).toContainText('NOVO-B.CO');
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
  // The emulator's bottom warning overlays low sidebar controls; keyboard
  // activation follows the actual link without removing that warning.
  await page.getByRole('link', { name: 'Settings & data' }).press('Enter');
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

test('owner saves a real-data strategy, compares identical budgets and reloads the preferred choice', async ({
  page,
}) => {
  const db = getFirestore(admin);
  for (const [id, rates] of [
    ['eunl', [6, 7, 8]],
    ['sxr8', [6, 6, 6]],
  ] as const) {
    await db.doc(`market/${id}`).set({
      instrumentId: id,
      currency: 'EUR',
      source: 'Alpha Vantage',
      providerSymbol: `${id.toUpperCase()}.DEX`,
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      fetchedAt: '2026-10-04T10:00:00.000Z',
      fxToDkk: 8,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 999 },
      points: rates.map((fxToDkk, i) => {
        const date = new Date(Date.UTC(2025, i + 1, 0)).toISOString().slice(0, 10);
        return { date, close: 100, adjustedClose: 100, fxToDkk, fxDate: date };
      }),
    });
  }
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/strategies');
  await page.getByLabel('Strategy name', { exact: true }).fill('Cloud developed markets');
  await page.getByLabel('Investment 1', { exact: true }).selectOption('eunl');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('2000');
  await page.getByLabel('Why this strategy?').fill('A saved research decision.');
  await expect(page.locator('.strategy-outcomes')).toContainText('6.952');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Investment strategy saved');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByLabel('Strategy name', { exact: true }).fill('Cloud two-fund strategy');
  await page.getByLabel('Investment 1', { exact: true }).selectOption('eunl');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('1000');
  await page.getByRole('button', { name: 'Add investment', exact: true }).click();
  await page.getByLabel('Investment 2', { exact: true }).selectOption('sxr8');
  await page.getByLabel('Allocation 1 (%)').fill('50');
  await page.getByLabel('Allocation 2 (%)').fill('50');
  await expect(page.locator('.strategy-outcomes')).toContainText('3.238');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Make preferred', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferred strategy saved');
  await page
    .getByLabel('Compare with saved strategy')
    .selectOption({ label: 'Cloud developed markets' });
  await expect(page.locator('.strategy-outcome')).toHaveCount(2);
  await expect(page.locator('.strategy-outcome').nth(1)).toContainText('3.476');
  const stored = (await db.doc(`users/${ownerUid}/workspace/current`).get()).data()!;
  expect(stored.data.version).toBe(3);
  expect(stored.data.strategies).toHaveLength(2);
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(
    'Cloud two-fund strategy',
  );
  await page.goto('./#/');
  await expect(page.locator('.preferred-strategy')).toContainText('Cloud two-fund strategy');
});

test('owner queues market search and history without sending provider credentials to the browser', async ({
  page,
}) => {
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore');
  await page.getByLabel('Search investments').fill('IBM');
  await page.getByRole('button', { name: 'Search markets', exact: true }).click();
  await expect(page.getByText(/“ibm” is queued/)).toBeVisible();
  const request = (await getFirestore(admin).collection('discoveryRequests').get()).docs.find(
    (d) => d.data().query === 'ibm',
  )!;
  const item = {
    id: 'av-ibm',
    name: 'International Business Machines',
    shortName: 'IBM',
    ticker: 'IBM',
    exchange: 'US',
    currency: 'USD',
    kind: 'Stock',
    region: 'United States',
    description: 'Emulated listing',
    isin: '',
    source: 'https://www.alphavantage.co/documentation/',
    sourceKind: 'provider',
    providerSymbol: 'IBM',
    color: '#396d6c',
  };
  await getFirestore(admin).doc('instrumentRegistry/av-ibm').set(item);
  await request.ref.set({
    ...request.data(),
    status: 'ready',
    completedAt: new Date().toISOString(),
    results: [item],
  });
  await page.getByRole('button', { name: 'Check search results' }).click();
  await page.getByRole('button', { name: 'IBM · IBM · US · USD', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'IBM: history coverage' })).toBeVisible();
  await page.getByRole('button', { name: 'Request history', exact: true }).click();
  await expect(
    page.getByText('History is queued. Check after the next scheduled data update.'),
  ).toBeVisible();
  expect((await getFirestore(admin).doc('marketRequests/av-ibm').get()).data()?.status).toBe(
    'pending',
  );
});

test('owner saves and reloads a Danish fund strategy using adjusted history and separate tax facts', async ({
  page,
}) => {
  const db = getFirestore(admin);
  for (const id of ['sparindex-global', 'spyi']) {
    const item = getInstrument(id);
    await db.doc(`instrumentRegistry/${id}`).set(item);
    await db.doc(`market/${id}`).set({
      instrumentId: id,
      currency: item.currency,
      source: 'Yahoo Finance',
      providerSymbol: item.yahooSymbol,
      frequency: 'monthly',
      adjustment: 'splits-and-dividends',
      closeAdjustment: 'splits',
      fetchedAt: '2026-10-04T10:00:00.000Z',
      fxToDkk: item.currency === 'DKK' ? 1 : 7.46,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
      quote: { date: '2026-10-02', close: 999 },
      points: [100, 110, 121].map((adjustedClose, i) => {
        const date = new Date(Date.UTC(2026, i + 7, 0)).toISOString().slice(0, 10);
        return {
          date,
          close: adjustedClose,
          adjustedClose,
          fxToDkk: item.currency === 'DKK' ? 1 : 7.46,
          fxDate: date,
        };
      }),
    });
  }
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore?investment=sparindex-global');
  await expect(page.getByText('Yahoo Finance history: 2026-07-31 to 2026-09-30.')).toBeVisible();
  await expect(page.locator('.detail-metrics').first()).toContainText('999');
  await expect(page.locator('.fund-facts')).toContainText(
    'gains taxed on sale; distributions taxed when paid',
  );
  await page.getByRole('link', { name: 'Build a strategy', exact: true }).click();
  await page.getByLabel('Strategy name', { exact: true }).fill('Cloud Danish index fund');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('1000');
  // Contributions at each month end: 1000 * 1.21 + 1000 * 1.1 + 1000 = 3310.
  await expect(page.locator('.strategy-outcomes')).toContainText('3.310');
  await page.getByLabel('Future tax illustration').selectOption('general');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Investment strategy saved');
  await expect(page.getByRole('button', { name: 'Use budget in planner' })).toBeDisabled();
  await page.getByLabel('Future tax illustration').selectOption('none');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Make preferred', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferred strategy saved');
  await page.goto('./#/strategies');
  await page.reload();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(
    'Cloud Danish index fund',
  );
  await expect(page.locator('.strategy-outcomes')).toContainText('3.310');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByLabel('Strategy name', { exact: true }).fill('Cloud all-country ETF');
  await page.getByLabel('Investment 1', { exact: true }).selectOption('spyi');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('1000');
  await page.getByLabel('Future tax illustration').selectOption('annual');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page
    .getByLabel('Compare with saved strategy')
    .selectOption({ label: 'Cloud Danish index fund' });
  await expect(page.locator('.strategy-outcome')).toHaveCount(2);
  for (const outcome of await page.locator('.strategy-outcome').all()) {
    await expect(outcome).toContainText('3.000');
    await expect(outcome).toContainText('3.310');
  }
  await expect(page.getByRole('button', { name: 'Use budget in planner' })).toBeEnabled();
});

test('sign-in values holdings from lightweight quotes and reads only histories opened for research', async ({
  page,
}) => {
  const db = getFirestore(admin);
  await db.doc('marketQuotes/novo').set(
    quoteSchema.parse({
      instrumentId: 'novo',
      currency: 'DKK',
      source: 'Yahoo Finance',
      providerSymbol: 'NOVO-B.CO',
      fetchedAt: '2026-10-04T12:00:00.000Z',
      quote: { date: '2026-10-02', close: 350 },
      fxToDkk: 1,
      fxDate: '2026-10-02',
      fxSource: 'ECB',
    }),
  );
  const workspace = (await db.doc(`users/${ownerUid}/workspace/current`).get()).data()!;
  await db.doc(`users/${ownerUid}/workspace/current`).set({
    ...workspace,
    revision: workspace.revision + 1,
    data: {
      ...workspace.data,
      transactions: [
        {
          id: 'quote-only-buy',
          instrumentId: 'novo',
          type: 'buy',
          date: '2026-01-02',
          quantity: 2,
          price: 100,
          fx: 1,
          fees: 0,
          note: '',
        },
      ],
      watchlist: [{ instrumentId: 'novo', note: '' }],
    },
  });
  const historyReads: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('Firestore/Listen/channel') || !request.postData()) return;
    for (const value of new URLSearchParams(request.postData()!).values())
      for (const match of value.matchAll(/\/documents\/market\/([a-z0-9-]+)/g))
        historyReads.push(match[1]);
  });
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await expect(page.locator('.watch-price')).toContainText('350 DKK');
  expect(historyReads).toEqual([]);
  await page.goto('./#/portfolio');
  await expect(page.locator('.stat-grid')).toContainText('700');
  expect(historyReads).toEqual([]);
  await page.goto('./#/explore?investment=novo');
  await expect(page.getByText('Yahoo Finance history: 2026-07-31 to 2026-09-30.')).toBeVisible();
  await expect(page.locator('.detail-metrics').first()).toContainText('350');
  expect([...new Set(historyReads)]).toEqual(['novo']);
  const count = historyReads.length;
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await page.getByRole('button', { name: 'Trading currency', exact: true }).click();
  expect(historyReads.length).toBe(count);
  await page.getByRole('checkbox', { name: 'EUNL', exact: true }).check();
  await expect(page.getByText('No overlapping history', { exact: true })).toBeVisible();
  expect([...new Set(historyReads)]).toEqual(['novo', 'eunl']);
});

test('missing saved history is disclosed, remembered and retried after an import', async ({
  page,
}) => {
  const db = getFirestore(admin);
  const item = getInstrument('sppw');
  await db.doc('instrumentRegistry/sppw').set(item);
  await db.doc('market/sppw').delete();
  await signIn(page, ownerEmail);
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
  await page.goto('./#/explore?investment=sppw');
  await expect(page.getByText('Ready for real market data', { exact: true })).toBeVisible();
  const template = (await db.doc('market/spyi').get()).data()!;
  await db.doc('market/sppw').set({ ...template, instrumentId: 'sppw', providerSymbol: 'SPPW.DE' });
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await expect(page.getByText('Ready for real market data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByText('Yahoo Finance history: 2026-07-31 to 2026-09-30.')).toBeVisible();
});
