import { test, expect } from '@playwright/test';

test('Danish universe supports pagination, ISIN search, share classes and First North without invented prices', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/explore');
  await page.getByRole('button', { name: 'Danish stocks', exact: true }).click();
  await expect(page.getByLabel('Investment pages')).toContainText('of 146 listings');
  expect(await page.locator('.investment-table tbody tr').count()).toBe(20);
  const first = await page.locator('.investment-table tbody tr').first().textContent();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  expect(await page.locator('.investment-table tbody tr').first().textContent()).not.toBe(first);
  await page.getByLabel('Search investments').fill('DK0010244425');
  await expect(page.locator('.investment-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.investment-table')).toContainText('MAERSK-A');
  await expect(page.locator('.investment-table')).not.toContainText('MAERSK-B');
  await expect(page.locator('.investment-table')).toContainText('Not loaded');
  await page.getByLabel('Search investments').fill('');
  await page.getByRole('button', { name: 'First North', exact: true }).click();
  await expect(page.locator('.investment-table')).toContainText('First North DK');
  await expect(page.locator('.investment-table')).not.toContainText('OMXC');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});
