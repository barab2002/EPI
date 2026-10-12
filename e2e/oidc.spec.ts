import { expect, test } from '@playwright/test';

/** SSO sign-in/sign-out through the real Keycloak login page. Run via scripts/e2e-oidc.sh. */
const user = process.env.EPI_E2E_OIDC_USER;
const password = process.env.EPI_E2E_OIDC_PASSWORD;
test.skip(!user || !password, 'requires scripts/e2e-oidc.sh (ephemeral Keycloak)');

test('signs in with Keycloak, lands on the requested page, and signs out of both', async ({
  page,
}) => {
  await page.goto('/kpis');
  await page.getByRole('link', { name: 'Sign in with your organization account' }).click();
  // Keycloak's own login page.
  await page.locator('#username').fill(user!);
  await page.locator('#password').fill(password!);
  await page.locator('#kc-login').click();
  await expect(page).toHaveURL(/\/kpis$/);
  await expect(page.getByRole('heading', { name: 'KPI catalog' })).toBeVisible();
  await expect(page.getByText('Taylor Lead')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  // EPI keeps no ID token, so Keycloak asks the user to confirm the logout (no id_token_hint).
  await expect(page.getByRole('heading', { name: 'Logging out' })).toBeVisible();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();

  // The Keycloak session is gone too: signing in again shows the login form.
  await page.getByRole('link', { name: 'Sign in with your organization account' }).click();
  await expect(page.locator('#username')).toBeVisible();
});

test('shows a helpful message when sign-in is refused', async ({ page }) => {
  await page.goto('/?login_error=not_provisioned');
  await expect(page.getByRole('alert')).toContainText('do not have an EPI account');
});
