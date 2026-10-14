import { expect, Page, test } from '@playwright/test';

/** Spec §14 functional: a manager logs in, drills down, sees authorized metrics, submits an assessment. */

async function signInAs(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();
  await expect(page.getByText('all people and data shown are synthetic').first()).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name: `Hello, ${name.split(' ')[0]}` })).toBeVisible();
}

async function signOut(page: Page) {
  // On narrow screens the sign-out button is in the stacked sidebar.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();
}

test('group manager drills down org → group → team → developer and opens a KPI explanation', async ({
  page,
}) => {
  await signInAs(page, 'Gal Groupman');
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organization', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Platform', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Platform/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cycle Time' })).toBeVisible();
  await page.getByRole('link', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Platform');
  // The chosen KPI window follows the drill-down and the way back (UX-064).
  await page.getByRole('button', { name: '180d' }).first().click();
  await expect(page).toHaveURL(/window=180d/);
  await page.getByRole('link', { name: 'Dana Dev' }).click();
  await expect(page.getByRole('heading', { name: 'Dana Dev' })).toBeVisible();
  await expect(page).toHaveURL(/window=180d/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Payments' })).toHaveAttribute(
    'href',
    /window=180d/,
  );
  await expect(crumbs.getByRole('link', { name: 'Platform' })).toHaveAttribute(
    'href',
    /window=180d/,
  );
  await page.getByRole('button', { name: 'How calculated?' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('median((done_at − started_at)');
  await expect(drawer).toContainText('Worked example');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  // Out-of-scope team is not reachable by URL either.
  await page.goto('/organization');
  await expect(page.getByRole('link', { name: 'Mobile' })).toHaveCount(0);
  await signOut(page);
});

test('team lead submits a monthly assessment; the developer sees it; a peer does not', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mutating flow runs once');
  await signInAs(page, 'Rae Lead');
  // Home leads with the month's assessments still to write (scoped to Rae's team).
  await expect(page.getByRole('heading', { name: /^Assessments to write/ })).toBeVisible();
  await page
    .getByRole('link', { name: /^Mobile/ })
    .first()
    .click();
  await page.getByRole('link', { name: 'Maya Mobile' }).click();
  const form = page.getByRole('form', { name: 'Write this month’s assessment' });
  const existing = page.getByText('Drove the offline sync redesign');
  await expect(form.or(existing).first()).toBeVisible(); // re-runs find it already submitted
  if (await form.isVisible()) {
    await form.getByLabel('4: Above-grade autonomy').check();
    await form.getByLabel('3: Progressing as agreed').check();
    await form.getByRole('textbox').fill('Drove the offline sync redesign with minimal guidance.');
    await form.getByRole('button', { name: 'Submit' }).click();
  }
  // The form gives way to a lasting confirmation for this month (also on re-runs).
  await expect(page.getByText(/You submitted this month’s assessment on/)).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('Drove the offline sync redesign')).toBeVisible();
  await signOut(page);

  await signInAs(page, 'Maya Mobile');
  await page.getByRole('link', { name: 'Reviews' }).click();
  await expect(page.getByText('Drove the offline sync redesign')).toBeVisible();
  await signOut(page);

  await signInAs(page, 'Nir Mobile');
  await page.getByRole('link', { name: 'Reviews' }).click();
  await expect(page.getByText('No assessments yet.')).toBeVisible();
  await signOut(page);
});

test('developer in a 3-person team sees team totals at the minimum group size of 3', async ({
  page,
}) => {
  // ADR-034: totals are hidden only below 3 people (suppression itself: rbac.int.spec.ts).
  await signInAs(page, 'Jo Small');
  await expect(page.getByRole('heading', { name: 'Team aggregate: Identity' })).toBeVisible();
  await expect(page.getByText('Hidden: group too small')).toHaveCount(0);
  await signOut(page);
});
