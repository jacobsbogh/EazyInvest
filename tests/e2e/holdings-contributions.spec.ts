import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import Papa from 'papaparse';

async function saveStrategy(page: import('@playwright/test').Page, second = 'sxr8') {
  await page.goto('/#/strategies');
  await page.getByLabel('Strategy name').fill('My monthly fund plan');
  await page.getByLabel('Investment 1', { exact: true }).selectOption('eunl');
  await page.getByRole('button', { name: 'Add investment' }).click();
  await page.getByLabel('Investment 2', { exact: true }).selectOption(second);
  await page.getByLabel('Allocation 1 (%)', { exact: true }).fill('50');
  await page.getByLabel('Allocation 2 (%)', { exact: true }).fill('50');
  await page.getByLabel('Strategy monthly contribution (DKK)', { exact: true }).fill('12000');
  await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Strategy saved', exact: true })).toBeVisible();
}
async function bounds(page: import('@playwright/test').Page) {
  expect(
    await page.locator('#main-content .card').evaluateAll((cards) =>
      cards.every((card) => {
        const r = card.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth + 1;
      }),
    ),
  ).toBe(true);
}
test('uses real dated holdings, shows direct-share overlap and leaves gaps explicit', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/holdings');
  await expect(page.getByLabel('Security overlap result')).toContainText(
    'observed security overlap',
  );
  await expect(
    page.getByText('Holdings as of 2026-10-02; checked 2026-10-04.', { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel('Holdings investment A', { exact: true }).selectOption('msft');
  await page.getByLabel('Holdings investment B', { exact: true }).selectOption('eunl');
  await expect(page.getByLabel('Security overlap result')).toContainText('4,01% observed');
  await page.getByLabel('Holdings investment A', { exact: true }).selectOption('sparindex-global');
  await expect(page.getByText(/Holdings as of 2026-07-31/)).toBeVisible();
  await expect(
    page.getByText('83,15% unresolved, unclassified cash or derivatives.'),
  ).toBeVisible();
  await page.getByLabel('Holdings investment A', { exact: true }).selectOption('danske-global');
  await expect(page.getByLabel('Security overlap result')).toContainText('0%–100%');
  await expect(page.getByText(/This does not establish zero overlap/)).toBeVisible();
  await saveStrategy(page);
  await page.getByRole('link', { name: 'Review holdings & overlap', exact: true }).click();
  await expect(page.getByLabel('Exposure strategy')).not.toHaveValue('');
  await expect(
    page.getByRole('heading', { name: 'Reported countries', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.exposure-distribution').first()).toContainText('United States');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await bounds(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('holdings-ready.png'), fullPage: true });
});

test('plans whole units, preserves cash, saves a budget and exports costs without creating trades', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await saveStrategy(page);
  await page.getByRole('link', { name: 'Plan monthly contributions', exact: true }).click();
  await expect(page.getByLabel('Monthly budget (DKK)', { exact: true })).toHaveValue('12000');
  await page.getByLabel('Available cash carried in (DKK)', { exact: true }).fill('100');
  await page.getByLabel('Minimum commission per order (DKK)').fill('29');
  await page.getByLabel('Currency-conversion charge (%)').fill('0.25');
  await page.getByLabel('Months to rehearse').fill('3');
  await page.getByRole('button', { name: 'Show fixed-price monthly rehearsal' }).click();
  await expect(
    page.getByRole('region', { name: 'Monthly contribution rehearsal' }).locator('tbody tr'),
  ).toHaveCount(3);
  await expect(page.getByText(/illustrative demo quotes and FX/)).toBeVisible();
  const next = page.getByRole('region', { name: 'Next contribution orders' });
  await expect(next.locator('tbody tr')).toHaveCount(2);
  await expect(next).toContainText('29,00');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export contribution worksheet' }).click();
  const file = await event,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const parsed = Papa.parse<Record<string, string>>(Buffer.concat(chunks).toString('utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
  expect(parsed).toHaveLength(6);
  expect(parsed[0].minimum_commission_dkk).toBe('29');
  expect(parsed[0].fx_percent).toBe('0.25');
  for (const month of ['1', '2', '3']) {
    const rows = parsed.filter((r) => r.month_index === month),
      spent = rows.reduce((s, r) => s + Math.round(Number(r.order_total_dkk) * 100), 0);
    expect(spent + Math.round(Number(rows[0].remaining_cash_dkk) * 100)).toBe(
      Math.round(Number(rows[0].available_cash_dkk) * 100),
    );
    expect(rows.every((r) => Number.isInteger(Number(r.planned_units)))).toBe(true);
  }
  await page.getByLabel('Unit sizing').selectOption('fractional');
  await page.getByLabel('Allocate new money').selectOption('gaps');
  await page.getByLabel('Monthly budget (DKK)', { exact: true }).fill('2500');
  await page.getByRole('button', { name: 'Save monthly budget to strategy' }).click();
  await expect(page.getByText('Strategy monthly budget saved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.goto('/#/contributions');
  await expect(page.getByLabel('Monthly budget (DKK)', { exact: true })).toHaveValue('2500');
  await page.getByLabel('Months to rehearse').fill('3');
  await page.getByRole('button', { name: 'Show fixed-price monthly rehearsal' }).click();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await bounds(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('contributions-ready.png'), fullPage: true });
  await page.goto('/#/portfolio');
  await expect(page.locator('.transactions-card tbody tr')).toHaveCount(2);
});
