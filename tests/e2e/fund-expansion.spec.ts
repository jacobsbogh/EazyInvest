import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('researches a Danish fund, discloses missing demo history and carries verified costs to planning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/explore');
  await page.getByRole('button', { name: 'Danish funds', exact: true }).click();
  await expect(page.locator('.investment-table tbody tr')).toHaveCount(4);
  await expect(page.locator('.investment-table')).toContainText('Not loaded');
  await page.getByLabel('Search investments').fill('DK0060747822');
  await page
    .getByRole('button', { name: 'View Sparindex INDEX Globale Aktier KL', exact: true })
    .click();
  const facts = page.locator('.fund-facts');
  await expect(facts).toContainText('0,5% (ongoing charge)');
  await expect(facts).toContainText('0,05% per year');
  await expect(facts).toContainText('0,12% / 0,07%');
  await expect(facts).toContainText('Distributing');
  await expect(facts).toContainText('gains taxed on sale; distributions taxed when paid');
  await expect(facts).toContainText('ISIN not found in the reviewed list');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('link', { name: 'Build a strategy', exact: true }).click();
  await expect(page.getByLabel('Investment 1', { exact: true })).toHaveValue('sparindex-global');
  await page.getByLabel('Future tax illustration').selectOption('general');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByText(/The planner does not model distribution tax; choose/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use budget in planner' })).toBeDisabled();
  await page.getByLabel('Future tax illustration').selectOption('none');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Use budget in planner' }).click();
  await expect(page.getByLabel('Annual fees (%)')).toHaveValue('0.5');
});

test('investment-company shares disclose unknown costs instead of zero fund fees', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/explore?investment=dk-dk0060315604');
  await expect(page.locator('.fund-facts')).toContainText('Annual fund cost: Not verified');
  await expect(page.locator('.fund-facts')).toContainText('Classification not verified');
  await page.getByRole('link', { name: 'Build a strategy', exact: true }).click();
  await page.getByLabel('Future tax illustration').selectOption('annual');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByText(/ordinary-account tax classification is unverified/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use budget in planner' })).toBeDisabled();
});
