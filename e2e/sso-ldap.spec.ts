import { expect, Page, test } from '@playwright/test';

/**
 * Sign-in with directory (AD-style) accounts through the production Keycloak overlay and a
 * synthetic LDAPS directory. Run via scripts/e2e-sso-ldap.sh.
 */
const pw = {
  taylor: process.env.LDAP_PW_TAYLOR,
  gal: process.env.LDAP_PW_GAL,
  outsider: process.env.LDAP_PW_OUTSIDER,
};
test.skip(!process.env.EPI_E2E_SSO_LDAP, 'requires scripts/e2e-sso-ldap.sh (directory + Keycloak)');

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with your organization account' }).click();
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
}

test('a team member signs in with their directory password and lands in EPI', async ({ page }) => {
  await signIn(page, 'taylor', pw.taylor!);
  await expect(page.getByText('Taylor Lead').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Organization' })).toBeVisible();
});

test('members of another pilot team group can sign in too', async ({ page }) => {
  await signIn(page, 'gal', pw.gal!);
  await expect(page.getByText('Gal Groupman').first()).toBeVisible();
  // Made administrator with `setup-admin` by scripts/e2e-sso-ldap.sh before the browser run.
  await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
});

test('a wrong password is refused by the directory', async ({ page }) => {
  await signIn(page, 'taylor', `${pw.taylor}x`);
  await expect(
    page.locator('#input-error, .kc-feedback-text, [id*="error"]').first(),
  ).toContainText(/Invalid username or password/i);
});

test('a directory user outside the pilot team groups cannot sign in', async ({ page }) => {
  await signIn(page, 'outsider', pw.outsider!);
  await expect(
    page.locator('#input-error, .kc-feedback-text, [id*="error"]').first(),
  ).toContainText(/Invalid username or password/i);
});
