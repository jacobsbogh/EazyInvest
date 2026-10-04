import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('compares Danish fund distributions with a verified ETF and exports auditable scenarios', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/compare-funds');
  await expect(page.getByRole('heading', { name: 'Compare funds on equal terms.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeDisabled();
  await expect(
    page.getByText('Enter a distribution yield assumption to calculate this fund.'),
  ).toBeVisible();
  await page.getByLabel('Starting investment (DKK)', { exact: true }).fill('100000');
  await page.getByLabel('Monthly contribution (DKK)', { exact: true }).fill('0');
  await page.getByLabel('Horizon (years)', { exact: true }).fill('1');
  await page.getByLabel('Gross annual total return (%)', { exact: true }).fill('10');
  await page.getByLabel('Distribution yield A (%)', { exact: true }).fill('5');
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Fund A result' })).toContainText(/106\.89[89]/);
  await page.getByRole('button', { name: 'Show annual cash flows' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody tr').first()).toContainText('103.995');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export comparison' }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('eazyinvest-fund-comparison.csv');
  const stream = await exported.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('distribution_yield_percent');
  expect(csv).toContain('DK0060747822,1,100000,0,10,5,ordinary,true');
  expect(csv).toContain('IE00B4L5Y983,1,100000,0,10,0,ordinary,true');
  const [header, first] = csv.split('\n').map((line) => line.split(','));
  const value = (name: string) => Number(first[header.indexOf(name)]);
  expect(value('after_sale_dkk')).toBeCloseTo(106898.5, 6);
  expect(value('ongoing_charge_percent')).toBe(0.5);
  await page.getByLabel('Reinvest net distributions').uncheck();
  await expect(page.getByRole('region', { name: 'Fund A result' })).toContainText('3.995');
  await page.getByLabel('Include published fund transaction-cost estimates').check();
  await page.getByLabel('Assume issuer maximum entry and terminal exit charges').check();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('comparison-ready.png'), fullPage: true });
  expect(
    await page.locator('.fund-comparison .card').evaluateAll((cards) =>
      cards.every((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth + 1;
      }),
    ),
  ).toBe(true);
});

test('blocks unknown tax facts, keeps ASK excess cash and links from research', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/explore?investment=sparindex-global');
  await page.getByRole('link', { name: 'Compare costs and tax', exact: true }).click();
  await expect(page.getByLabel('Fund A', { exact: true })).toHaveValue('sparindex-global');
  await page.getByLabel('Distribution yield A (%)', { exact: true }).fill('5');
  await page.getByLabel('Fund B', { exact: true }).selectOption('vwce');
  await expect(page.getByRole('region', { name: 'Fund B result' })).toContainText(
    'Tax classification is unverified',
  );
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeDisabled();
  await page.getByLabel('Comparison account').selectOption('none');
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeEnabled();
  await page.getByLabel('Fund B', { exact: true }).selectOption('eunl');
  await page.getByLabel('Comparison account').selectOption('ask');
  await page.getByLabel('Starting investment (DKK)', { exact: true }).fill('200000');
  await page.getByLabel('Monthly contribution (DKK)', { exact: true }).fill('0');
  await page.getByLabel('Horizon (years)', { exact: true }).fill('1');
  await expect(page.getByRole('region', { name: 'Fund A result' })).toContainText('174.200');
  await expect(page.getByRole('region', { name: 'Fund A result' })).toContainText('25.800');
  await page.getByLabel('Horizon (years)', { exact: true }).fill('41');
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeDisabled();
  await page.getByLabel('Horizon (years)', { exact: true }).fill('1');
  await page.getByLabel('Fund A', { exact: true }).selectOption('danske-global');
  await expect(page.getByLabel('Distribution yield A (%)', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Export comparison' })).toBeDisabled();
});
