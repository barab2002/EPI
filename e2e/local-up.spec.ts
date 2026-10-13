import { expect, test } from '@playwright/test';

/**
 * The real app started with `./epi.sh up` (local sign-in, no AD): the first administrator signs in
 * with the one-time password, must choose a new one, and lands in EPI. Run via scripts/test-up.sh.
 */
test.skip(!process.env.EPI_E2E_UP, 'requires scripts/test-up.sh');

test('first administrator signs in, changes the one-time password and sees Administration', async ({
  page,
}) => {
  await page.goto('/');
  // Real sign-in only: no demo people to choose from.
  await expect(page.getByRole('button', { name: /Avery Admin/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Sign in with your organization account' }).click();
  await page.locator('#username').fill(process.env.EPI_UP_EMAIL!);
  await page.locator('#password').fill(process.env.EPI_UP_PASSWORD!);
  await page.locator('#kc-login').click();
  // Keycloak requires a new password (the printed one is temporary).
  await page.locator('#password-new').fill(process.env.EPI_UP_NEW_PASSWORD!);
  await page.locator('#password-confirm').fill(process.env.EPI_UP_NEW_PASSWORD!);
  await page.locator('[type=submit]').first().click();
  await expect(page.getByText('Ada Admin').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
  // The organization created by `up` is listed even without groups, ready to be built.
  await page.goto('/admin/organization');
  await expect(page.getByRole('heading', { name: 'Test Org' })).toBeVisible();
});
