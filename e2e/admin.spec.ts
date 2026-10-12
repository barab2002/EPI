import { expect, Page, test } from '@playwright/test';

/**
 * Administration flow against fake Jira/GitLab (synthetic data). Run via scripts/e2e-admin.sh.
 * With EPI_E2E_SCREENSHOTS=--screenshots it also refreshes the admin screenshots in docs/.
 */
test.skip(!process.env.EPI_E2E_ADMIN, 'requires scripts/e2e-admin.sh (fake Jira/GitLab)');
const shots = process.env.EPI_E2E_SCREENSHOTS === '--screenshots';

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
}

test('admin syncs sources, maps identities and statuses, and sees data quality', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Avery Admin/ }).click();
  await page.getByRole('link', { name: 'Administration' }).click();

  // Before any sync: data quality is honest about missing data.
  await expect(page.getByRole('heading', { name: 'Freshness' })).toBeVisible();
  await expect(page.getByText(/Stale/).first()).toBeVisible();

  // Integrations: sync both sources.
  await page.getByRole('link', { name: 'Integrations' }).click();
  const rows = page.getByRole('row');
  for (const name of ['jira-pilot', 'gitlab-pilot']) {
    await rows.filter({ hasText: name }).getByRole('button', { name: 'Sync now' }).click();
    await expect(rows.filter({ hasText: name }).getByText('succeeded').first()).toBeVisible({
      timeout: 20_000,
    });
  }
  await expect(page.getByText(/24 issues · 24 new/)).toBeVisible();
  await expect(page.getByText(/10 MRs · 10 new · 10 review requests/)).toBeVisible();
  await shot(page, '25-admin-integrations');

  // Identity mapping: map Jira and GitLab accounts of Dana to the synthetic person Dana Dev.
  await page.getByRole('link', { name: 'Identity mapping' }).click();
  await expect(page.getByText('Contractor Casey', { exact: true })).toBeVisible();
  const map = async (account: RegExp, person: string) => {
    const row = page.getByRole('row').filter({ hasText: account });
    await row.getByRole('searchbox').fill(person.split(' ')[0]);
    await row.getByRole('button', { name: person, exact: true }).click();
    // The list reload also shows a role=status "Loading…"; target the confirmation itself.
    await expect(page.locator('p.ok-text')).toContainText(`to ${person}`);
  };
  await shot(page, '26-admin-identity-mapping');
  await map(/JIRAUSER10101/, 'Dana Dev');
  await map(/7001/, 'Dana Dev');
  await map(/JIRAUSER10102/, 'Eli Engineer');
  await page.getByRole('button', { name: 'Mapped', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'JIRAUSER10101' })).toContainText(
    'Dana Dev',
  );

  // Status mappings: "In Review" is inferred as In progress; the admin sets Review.
  await page.getByRole('link', { name: 'Status mappings' }).click();
  await page.getByLabel('Category for In Review').selectOption('REVIEW');
  await expect(page.getByText(/“In Review” saved/)).toBeVisible();
  await shot(page, '27-admin-status-mappings');

  // Data quality reflects the work.
  await page.getByRole('link', { name: 'Data quality' }).click();
  await expect(page.getByText('Fresh').first()).toBeVisible();
  await expect(page.getByText('67%').or(page.getByText('66.7%'))).toBeVisible(); // 16 of 24 items
  await shot(page, '28-admin-data-quality');

  // A non-admin never sees administration.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /^Eli Engineer/ }).click();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.goto('/admin/identities');
  await expect(page.getByText('Administrator role required.')).toBeVisible();
});
