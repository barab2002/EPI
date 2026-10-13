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
    await expect(rows.filter({ hasText: name }).getByText('Succeeded').first()).toBeVisible({
      timeout: 20_000,
    });
  }
  await expect(page.getByText(/24 issues: 24 new/)).toBeVisible();
  await expect(page.getByText(/10 MRs: 10 new, 10 review requests/)).toBeVisible();

  // Daily sync: 23:00 in a zone where that hour is still ahead, so no run starts mid-test.
  const zone = ['UTC', 'Asia/Jerusalem', 'America/New_York', 'Pacific/Kiritimati'].find(
    (tz) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      ) < 22,
  )!;
  await page.getByRole('checkbox', { name: /Sync daily/ }).check();
  await page.getByRole('combobox', { name: /^Time(?! zone)/ }).selectOption('23:00');
  await page.getByRole('combobox', { name: /Time zone/ }).fill(zone);
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText(`Daily sync at 23:00 ${zone} saved.`)).toBeVisible();
  await expect(page.getByText(/Next run: \d/)).toBeVisible();
  await shot(page, '25-admin-integrations');

  // Identity mapping: map Jira and GitLab accounts of Dana to the synthetic person Dana Dev.
  await page.getByRole('link', { name: 'Identity mapping' }).click();
  await expect(page.getByText('Contractor Casey', { exact: true })).toBeVisible();
  const map = async (account: RegExp, person: string) => {
    const row = page.getByRole('row').filter({ hasText: account });
    await row.getByRole('searchbox').fill(person.split(' ')[0]);
    await row.getByRole('button', { name: person, exact: true }).click();
    // The list reload also shows a role=status "Loading…"; target the confirmation itself.
    await expect(page.locator('p.flash-ok')).toContainText(`to ${person}`);
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

  // Audit log: the admin's own changes are recorded; filter to identity mapping.
  // (Rows, not text: the action filter's <option>s carry the same names.)
  const auditRows = (action: string) => page.getByRole('row').filter({ hasText: action });
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(auditRows('sync.start').first()).toBeVisible();
  await page.getByRole('combobox', { name: /Action/ }).selectOption({ label: 'Identity mapping' });
  await expect(auditRows('identity.map')).toHaveCount(3);
  await expect(auditRows('sync.start')).toHaveCount(0);
  await page.getByRole('combobox', { name: /Action/ }).selectOption({ label: 'All actions' });
  await expect(auditRows('sync.start').first()).toBeVisible();
  await shot(page, '31-admin-audit-log');

  // A non-admin never sees administration.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /^Eli Engineer/ }).click();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.goto('/admin/identities');
  await expect(page.getByText(/Administration needs the Administrator role/)).toBeVisible();
});

test('admin builds a team and onboards a person; the group manager sees the new team', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Avery Admin/ }).click();
  await page.getByRole('link', { name: 'Administration' }).click();
  // Two links are called "Organization" (main nav and admin tab); go to the admin tab directly.
  await page.goto('/admin/organization');

  // New team "Edge" in the Platform group.
  const platform = page
    .locator('li')
    .filter({ has: page.getByText('Platform', { exact: true }) })
    .first();
  await platform.getByText('Rename / add team').click();
  await platform.getByRole('textbox', { name: 'New team in Platform' }).fill('Edge');
  await platform.getByRole('textbox', { name: 'New team in Platform' }).press('Enter');
  await expect(page.locator('p.flash-ok')).toContainText('Team Edge created.');

  // People: create a person, make them team lead of Edge, set a grade.
  await page.getByRole('link', { name: 'People' }).click();
  await page.getByLabel('Full name').fill('Rowan Newhire');
  await page.getByLabel('E-mail (optional)').fill('rowan.newhire@example.invalid');
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('heading', { name: 'Rowan Newhire' })).toBeVisible();
  await page.getByLabel(/^Scope/).selectOption({ label: 'Edge (Platform)' });
  await page.getByRole('button', { name: 'Assign role' }).click();
  await expect(page.getByRole('cell', { name: 'Edge' })).toBeVisible();
  await page.getByLabel(/^New grade/).selectOption({ label: 'Senior' });
  await page.getByRole('button', { name: 'Set grade' }).click();
  await expect(page.getByRole('list', { name: 'Grade history' })).toContainText('Senior');
  await shot(page, '30-admin-people');

  // Organization: add Rowan to Edge.
  await page.goto('/admin/organization');
  await page.getByRole('button', { name: 'Edge' }).click();
  await page.getByRole('searchbox', { name: 'Find a person to add…' }).fill('Rowan');
  await page.getByRole('button', { name: 'Rowan Newhire' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('p.flash-ok')).toContainText('Rowan Newhire added to Edge.');
  await expect(page.getByRole('cell', { name: 'Rowan Newhire' })).toBeVisible();
  await shot(page, '29-admin-organization');

  // The Platform group manager now sees the new team; the Product manager does not.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /^Gal Groupman/ }).click();
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edge' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /^Noa Groupwoman/ }).click();
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Mobile' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edge' })).toHaveCount(0);
});

test('admin imports team membership from the directory: map, preview, apply', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Avery Admin/ }).click();
  await page.goto('/admin/directory');
  await expect(page.getByRole('heading', { name: 'Directory import' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview import' })).toBeDisabled();

  // Team-Payments (synthetic directory: Eli, Taylor) feeds the Payments team.
  await page
    .getByLabel('EPI team for Team-Payments')
    .selectOption({ label: 'Payments (Platform)' });
  await expect(page.locator('p.flash-ok')).toContainText('Team-Payments now feeds Payments');
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByText(/^Applying will link 2 existing people by e-mail/)).toBeVisible();
  const leaving = page.locator('.form-group').filter({ hasText: 'Leaving a team' });
  await expect(leaving).toContainText('Dana Dev');
  await expect(
    page.getByText('Group Team-Platform is not mapped to a team', { exact: false }),
  ).toBeVisible();
  await shot(page, '32-admin-directory');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Apply \d+ changes$/ }).click();
  await expect(page.locator('p.flash-ok')).toContainText('Import applied');
  await expect(page.getByText(/^Last import:/)).toBeVisible();

  // Payments now has exactly the directory group's members.
  await page.goto('/admin/organization');
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  const members = page.getByRole('table').last();
  await expect(members.getByRole('row')).toHaveCount(3); // header + Eli + Taylor
  await expect(members).toContainText('Eli Engineer');
  await expect(members).toContainText('Taylor Lead');

  // A second preview has nothing left to do.
  await page.goto('/admin/directory');
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(
    page.getByText('EPI already matches the directory. Nothing to change.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled();
});

test('admin edits a source connection in Settings and tests it', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Avery Admin/ }).click();
  await page.goto('/admin/settings');
  const jira = page.locator('form').filter({ hasText: 'jira-pilot' });
  await expect(jira.getByText('Token found on the server')).toBeVisible();
  await jira.getByRole('button', { name: 'Test connection' }).click();
  await expect(jira.getByText(/token accepted/)).toBeVisible();
  await jira.getByLabel('Project keys').fill('PAY, OPS');
  await jira.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('p.flash-ok')).toContainText('jira-pilot saved');
  await expect(page.getByLabel('Project keys').first()).toHaveValue('PAY, OPS');
  await shot(page, '33-admin-settings');
  // An address with credentials is refused with a readable message.
  await jira.getByLabel('Address').fill('https://user:secret@jira.corp.example');
  await jira.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('p.flash-error')).toContainText('user name or password');
});
