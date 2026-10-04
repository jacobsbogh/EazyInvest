import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('creates, compares, saves and reloads a preferred strategy and carries its budget to planning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/strategies');
  await page.getByLabel('Strategy name', { exact: true }).fill('My global strategy');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('2000');
  await page.getByLabel('Why this strategy?').fill('Keep it simple and review concentration.');
  await expect(page.locator('.strategy-outcomes')).toContainText('120.000');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Investment strategy saved');
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  await page.getByLabel('Strategy name', { exact: true }).fill('Developed and emerging');
  await page.getByLabel('Strategy starting money (DKK)').fill('0');
  await page.getByLabel('Strategy monthly contribution (DKK)').fill('1000');
  await page.getByRole('button', { name: 'Add investment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save strategy', exact: true })).toBeDisabled();
  await page.getByLabel('Investment 1', { exact: true }).selectOption('eunl');
  await page.getByLabel('Investment 2', { exact: true }).selectOption('is3n');
  await page.getByLabel('Allocation 1 (%)').fill('80');
  await page.getByLabel('Allocation 2 (%)').fill('20');
  await page.getByLabel('Rebalancing', { exact: true }).selectOption('annual');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Make preferred', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferred strategy saved');
  await page
    .getByLabel('Compare with saved strategy')
    .selectOption({ label: 'My global strategy' });
  await expect(page.locator('.strategy-outcome')).toHaveCount(2);
  await expect(page.locator('.strategy-outcome').nth(0)).toContainText('60.000');
  await expect(page.locator('.strategy-outcome').nth(1)).toContainText('60.000');
  await page.getByLabel('Strategy start month').selectOption('2022-01');
  await page.getByRole('button', { name: 'Show portfolio monthly values' }).click();
  await expect(page.locator('.strategy-results tbody').first().locator('tr')).toHaveCount(48);
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(
    'Developed and emerging',
  );
  await expect(page.getByLabel('Strategy start month')).toHaveValue('2022-01');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.goto('/#/');
  await expect(page.locator('.preferred-strategy')).toContainText('Developed and emerging');
  await page.goto('/#/strategies');
  await page.getByRole('button', { name: 'Use budget in planner' }).click();
  await expect(page.getByLabel('Monthly contribution (DKK)', { exact: true })).toHaveValue('1000');
  await expect(page.getByLabel('Annual fees (%)')).toHaveValue('0.196');
  await expect(page.getByLabel('Annual return: 6%')).toBeVisible();
});

test('searches exact ISINs, opens a strategy from Explore and deletes a saved choice', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/explore');
  await page.getByLabel('Search investments').fill('IE00B4L5Y983');
  await page
    .getByRole('button', { name: 'View iShares Core MSCI World UCITS ETF', exact: true })
    .click();
  await expect(page.getByText('Exact ISIN match')).toBeVisible();
  await page.getByRole('link', { name: 'Build a strategy', exact: true }).click();
  await expect(page.getByLabel('Investment 1', { exact: true })).toHaveValue('eunl');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('link', { name: 'Find another investment in Explore' }).click();
  await page.getByLabel('Search investments').fill('IS3N');
  await page
    .getByRole('button', { name: 'View iShares Core MSCI EM IMI UCITS ETF', exact: true })
    .click();
  await page.getByRole('link', { name: 'Use this investment', exact: true }).click();
  await expect(page.getByLabel('Investment 2', { exact: true })).toHaveValue('is3n');
  await expect(page.getByLabel('Strategy name', { exact: true })).toHaveValue(
    'My investment strategy',
  );
  await page.getByLabel('Allocation 1 (%)').fill('90');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Delete strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Remove strategy', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: 'Create your first strategy' })).toBeVisible();
});
