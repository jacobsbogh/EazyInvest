import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Your future starts here.' })).toBeVisible();
}
async function navigate(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('#main-content')).toBeVisible();
}
test('welcome, demo, and responsive navigation have no horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await expect(page.getByText('Potential in 20 years')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole('link', { name: 'Future planner', exact: true }).click();
  } else {
    await page.getByRole('link', { name: 'Future planner', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Make room for possibility.' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('planner saves, reloads, and changes the crash scenario', async ({ page }) => {
  await enter(page);
  await navigate(page, '/planner');
  await page.getByLabel('Monthly contribution (DKK)', { exact: true }).fill('4000');
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('button', { name: 'Plan saved' })).toBeVisible();
  await page.getByLabel('Include a market crash').check();
  await expect(page.getByLabel('Include a market crash')).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByLabel('Monthly contribution (DKK)', { exact: true })).toHaveValue('4000');
  await page.getByRole('button', { name: 'Show year-by-year values' }).click();
  await expect(page.getByRole('columnheader', { name: 'Separate cash' })).toBeVisible();
});
test('watchlist, notes, filters and comparisons work', async ({ page }) => {
  await enter(page);
  await navigate(page, '/explore');
  await expect(page.getByRole('button', { name: '20Y', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText(/Available history starts/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Add MSFT to watchlist' }).click();
  await page.getByRole('button', { name: 'View Microsoft', exact: true }).click();
  await page
    .getByLabel('Why are you following this?')
    .fill('Research the overlap with a global fund.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('status')).toContainText('Research note saved');
  await page.getByRole('checkbox', { name: 'VWCE', exact: true }).check();
  await expect(page.getByText('Price change indexed to 100 · common months only')).toBeVisible();
  await page.getByRole('button', { name: 'Watchlist', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search investments' }).fill('Microsoft');
  await expect(page.getByRole('button', { name: 'View Microsoft', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Novo Nordisk B', exact: true })).toHaveCount(
    0,
  );
});
test('records transactions, rejects overselling, and removes an entry', async ({ page }) => {
  await enter(page);
  await navigate(page, '/portfolio');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('Investment', { exact: true }).selectOption('msft');
  await page.getByLabel('Number of units').fill('2');
  await page.getByLabel('Price per unit (USD)').fill('300');
  await page.getByLabel('DKK per 1 USD').fill('6.8');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('3 recorded transactions')).toBeVisible();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('Investment', { exact: true }).selectOption('msft');
  await page.getByLabel('Transaction type').selectOption('sell');
  await page.getByLabel('Number of units').fill('3');
  await page.getByLabel('Price per unit (USD)').fill('300');
  await page.getByLabel('DKK per 1 USD').fill('6.8');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('status')).toContainText('exceeds');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Delete buy MSFT/ }).click();
  await page.getByRole('button', { name: 'Remove transaction', exact: true }).click();
  await expect(page.getByText('2 recorded transactions')).toBeVisible();
});
test('CSV import previews before committing and rejects duplicate IDs', async ({ page }) => {
  await enter(page);
  await navigate(page, '/portfolio');
  const csv =
    'id,date,instrument,type,quantity,price,fx_to_dkk,fees_dkk,note\nimport-1,2025-04-01,msft,buy,1,300,6.8,0,CSV example';
  await page
    .getByLabel('Import transactions CSV')
    .setInputFiles({ name: 'trades.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('dialog', { name: 'Review your CSV import' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 transactions' }).click();
  await expect(page.getByText('3 recorded transactions')).toBeVisible();
  await page
    .getByLabel('Import transactions CSV')
    .setInputFiles({ name: 'trades.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('status')).toContainText('unique');
});
test('learning progress, tax calculator and backup restore validation', async ({ page }) => {
  await enter(page);
  await navigate(page, '/learn');
  await page.getByRole('button', { name: 'Mark as understood' }).click();
  await expect(page.getByRole('button', { name: 'Completed · mark unread' })).toBeVisible();
  await navigate(page, '/tax');
  await page.getByLabel('Account value on 31 December 2025 (DKK)').fill('105000');
  await page.getByLabel('Net deposits during 2026 (DKK)').fill('50000');
  await expect(page.locator('.calculator-result').first()).toContainText('19.200');
  await navigate(page, '/settings');
  await page.getByLabel('Restore JSON backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('status')).toContainText('invalid');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear demo workspace' }).click();
  await page.getByLabel('Type CLEAR to continue').fill('CLEAR');
  await page.getByRole('button', { name: 'Clear demo', exact: true }).click();
  await navigate(page, '/portfolio');
  await expect(
    page.getByRole('heading', { name: 'A clear view starts with your first entry' }),
  ).toBeVisible();
});
