import { expect, Page, test } from '@playwright/test';

/** Layout guard (DESIGN.md §4, UX-001): no horizontal page scroll at any supported width. */
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

async function signIn(page: Page, who: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name: who }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function expectNoOverflow(page: Page, label: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, `${label} at ${w}px`).toBeLessThanOrEqual(client);
  }
}

test('no horizontal overflow on key screens', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'widths are set explicitly');
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoOverflow(page, 'sign-in');
  await signIn(page, /^Taylor Lead/);
  for (const path of ['/', '/kpis', '/reviews', '/organization']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoOverflow(page, path);
  }
  await page.getByRole('link', { name: 'Payments' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoOverflow(page, 'team');
  await page.getByRole('button', { name: 'Sign out' }).click();
  // Sign-out may redirect through the IdP (demo Keycloak); let it finish before navigating again.
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();
  await signIn(page, /^Avery Admin/);
  for (const path of [
    '/admin/organization',
    '/admin/people',
    '/admin/directory',
    '/admin/integrations',
    '/admin/identities',
    '/admin/statuses',
    '/admin/data-quality',
    '/admin/audit',
    '/admin/settings',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoOverflow(page, path);
  }
});

test('no horizontal overflow in Hebrew (right-to-left)', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'widths are set explicitly');
  test.setTimeout(120_000);
  await page.addInitScript(() => window.localStorage.setItem('epi.locale', 'he'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'כניסה ל-EPI' })).toBeVisible();
  await expectNoOverflow(page, 'sign-in (he)');
  await page.getByRole('button', { name: /^Taylor Lead/ }).click();
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible();
  for (const path of ['/', '/kpis', '/reviews', '/organization']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoOverflow(page, `${path} (he)`);
  }
  await page.getByRole('link', { name: 'Payments' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoOverflow(page, 'team (he)');
});
