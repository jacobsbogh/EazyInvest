import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('all screens render without errors and fit the viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true });
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  for (const path of [
    '/',
    '/planner',
    '/explore',
    '/strategies',
    '/compare-funds',
    '/portfolio',
    '/learn',
    '/tax',
    '/settings',
  ]) {
    await page.goto(`/#${path}`);
    await expect(page.locator('#main-content h1')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${path.slice(1) || 'overview'}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('essential controls and page landmarks are accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});
