import { expect, Page, test } from '@playwright/test';

/**
 * UI/UX review captures (UX-01, docs/UI_UX_TESTS.md): key screens at the four review widths.
 * Not a regression test. Run against a demo: EPI_UX_CAPTURE=<outDir> npx playwright test
 * e2e/ux-capture.spec.ts --project=desktop
 */
const out = process.env.EPI_UX_CAPTURE;
test.skip(!out, 'set EPI_UX_CAPTURE=<outDir> to capture review screenshots');

const WIDTHS = [
  ['mobile', 390, 844],
  ['tablet', 768, 1024],
  ['desktop', 1440, 900],
  ['large', 1920, 1080],
] as const;

async function signIn(page: Page, who: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name: who }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function shoot(page: Page, name: string) {
  for (const [label, w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}--${label}.png`, fullPage: true });
  }
}

test('capture key screens', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await shoot(page, '01-login');

  await signIn(page, /^Taylor Lead/);
  await shoot(page, '02-home-team-lead');
  await page.getByRole('link', { name: 'Payments' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, '03-team');
  await page
    .getByRole('button', { name: /How calculated/ })
    .first()
    .click();
  await shoot(page, '04-kpi-drawer');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Eli Engineer' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, '05-developer');
  await page.goBack();
  await page.getByRole('link', { name: 'Dana Dev' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dana Dev');
  await shoot(page, '05b-assessment-form');
  await page.getByRole('link', { name: 'Reviews' }).first().click();
  await shoot(page, '06-reviews');
  await page.getByRole('link', { name: 'KPI catalog' }).click();
  await shoot(page, '07-kpi-catalog');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();

  await signIn(page, /^Morgan Example/);
  await page.getByRole('link', { name: 'Organization' }).first().click();
  await shoot(page, '08-organization');
  await page.getByRole('link', { name: 'Platform', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Platform');
  await shoot(page, '08b-group');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();

  await signIn(page, /^Avery Admin/);
  await page.goto('/admin/organization');
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Payments/, level: 2 })).toBeVisible();
  await shoot(page, '09a-admin-organization');
  await page.goto('/admin/people');
  await page.getByRole('searchbox').first().fill('Dana');
  await page.getByRole('button', { name: 'Dana Dev' }).click();
  await expect(page.getByRole('heading', { name: /Dana Dev/ })).toBeVisible();
  await shoot(page, '09-admin-people');
  for (const tab of ['integrations', 'identities', 'statuses', 'audit']) {
    await page.goto(`/admin/${tab}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, `09-admin-${tab}`);
  }
  await page.goto('/admin/data-quality');
  await shoot(page, '10-admin-data-quality');
});
