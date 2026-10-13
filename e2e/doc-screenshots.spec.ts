import { expect, Page, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Regenerates the documentation screenshots in docs/screenshots (docs/SCREENSHOTS.md) from a
 * running demo. Not a regression test; synthetic data only, no passwords on any screen.
 *   ./epi.sh demo && EPI_DOC_SHOTS=1 npx playwright test e2e/doc-screenshots.spec.ts --project=desktop
 * Admin shots (25–31) come from `scripts/e2e-admin.sh --screenshots`; the Keycloak page (02) is
 * Keycloak's own and is kept as captured.
 */
test.skip(!process.env.EPI_DOC_SHOTS, 'set EPI_DOC_SHOTS=1 to regenerate docs/screenshots');

const DIR = 'docs/screenshots';
const DESKTOP = { width: 1366, height: 900 };
const titles = new Map<string, string>(
  (JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as { name: string; title: string }[]).map(
    (e) => [e.name, e.title],
  ),
);

async function shot(page: Page, name: string, title: string, fullPage = true) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
  titles.set(name, title);
}

async function signIn(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name: `Hello, ${name.split(' ')[0]}` })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to EPI' })).toBeVisible();
}

test('regenerate documentation screenshots', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(DESKTOP);

  await page.goto('/');
  await shot(
    page,
    '01-sign-in',
    'Sign-in page: single sign-on, demo people grouped by role (synthetic)',
  );
  await page.goto('/?login_error=not_provisioned');
  await shot(
    page,
    '20-sso-refused-message',
    'Sign-in refused (no EPI account): clear message, no auto-provisioning',
  );

  // Engineering manager: home, organization tree, team ids for the out-of-scope check.
  await signIn(page, 'Morgan Example');
  await shot(
    page,
    '04-home-engineering-manager',
    'Engineering manager home: organization KPIs and teams',
  );
  const teams = await page.evaluate(async () => {
    const tree = (await (await fetch('/api/v1/organization/tree')).json()) as {
      groups: { teams: { id: string; name: string }[] }[];
    }[];
    return Object.fromEntries(
      tree.flatMap((o) => o.groups.flatMap((g) => g.teams.map((t) => [t.name, t.id]))),
    );
  });
  await page.getByRole('link', { name: 'Organization', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Organization', exact: true })).toBeVisible();
  await shot(page, '05-organization-tree', 'Organization → group → team tree with access badges');
  await page.getByRole('link', { name: 'Platform', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Platform/);
  await shot(
    page,
    '06-group-overview',
    'Group overview: group KPIs and its teams (alphabetical, never ranked)',
  );
  await signOut(page);

  // Team lead: home, team, KPI window, explanation drawer, developer profile, assessment form.
  await signIn(page, 'Taylor Lead');
  await shot(
    page,
    '03-home-team-lead-sso',
    'Team lead home: assessments to write this month, team overview, own KPIs',
  );
  await page.getByRole('link', { name: 'Payments' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Payments/);
  await shot(
    page,
    '07-team-overview',
    'Team overview (managed): KPI strip with trend, sample, confidence and freshness; members',
  );
  await page.getByRole('button', { name: '180d' }).first().click();
  await expect(page).toHaveURL(/window=180d/);
  await shot(
    page,
    '08-kpi-window-180d',
    'Switching the KPI window (30/90/180 days; kept in the URL)',
  );
  await page.getByRole('button', { name: 'How calculated?' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Worked example');
  await shot(
    page,
    '09-kpi-explanation-drawer',
    '"How calculated?" sheet: formula, population, source, window, version, exclusions',
    false,
  );
  await drawer.getByRole('heading', { name: /Worked example/ }).scrollIntoViewIfNeeded();
  await shot(
    page,
    '10-kpi-evidence',
    'Sheet continued: limitations, worked example computed by the engine, items behind the value',
    false,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Eli Engineer' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eli Engineer');
  await shot(
    page,
    '11-developer-profile',
    'Developer profile (manager view): grade, team, flow KPIs with neutral trends, assessments',
  );
  await page.goBack();
  await page.getByRole('link', { name: 'Dana Dev' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dana Dev');
  const form = page.getByRole('form', { name: /assessment/i });
  if (await form.count()) {
    await form.scrollIntoViewIfNeeded();
    await shot(
      page,
      '12-assessment-form',
      'Monthly manager assessment: anchored 1–5 rubrics with required evidence',
    );
    // Submits a synthetic assessment for the demo person (re-runs find it already submitted).
    await form.getByLabel('3: Meets grade expectations').check();
    await form.getByLabel('3: Progressing as agreed').check();
    await form
      .getByRole('textbox')
      .fill('Shipped the refund retry flow and paired with Fran on the review backlog.');
    await form.getByRole('button', { name: 'Submit' }).click();
  }
  const done = page.getByText(/You submitted this month’s assessment/);
  await expect(done).toBeVisible();
  {
    await shot(
      page,
      '13-assessment-submitted',
      'After submitting: lasting confirmation; the assessment is locked for the month',
    );
  }
  await page.goto(`/teams/${teams.Mobile}`);
  await expect(page.getByRole('heading', { name: /not available/i })).toBeVisible();
  await shot(
    page,
    '14-out-of-scope',
    'Out-of-scope team opened by URL: “Not available” (server returns 404)',
  );
  await page.goto('/kpis');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(
    page,
    '19-kpi-catalog',
    'KPI catalog: versioned definitions, units, direction, scopes',
  );
  await signOut(page);

  // Developer: home and reviews about themselves.
  await signIn(page, 'Eli Engineer');
  await shot(
    page,
    '15-home-developer',
    'Developer home: own flow KPIs and team aggregate (no member-level evidence)',
  );
  await page.getByRole('link', { name: 'Reviews' }).first().click();
  await shot(
    page,
    '16-reviews-developer',
    'Reviews: the developer sees submitted assessments about themselves',
  );
  await signOut(page);

  // Privacy: a developer of a 3-person team sees no team aggregate.
  await signIn(page, 'Jo Small');
  await shot(
    page,
    '17-small-team-suppressed',
    'Privacy: a 3-person team shows team totals (minimum group size 3; smaller groups are hidden)',
  );
  await signOut(page);

  await signIn(page, 'Avery Admin');
  await page.getByRole('link', { name: 'Organization', exact: true }).first().click();
  await shot(
    page,
    '18-admin-structure-only',
    'Administrator: organization structure only — no KPIs or private reviews',
  );
  await signOut(page);

  await page.goto('/api/docs');
  await expect(page.locator('.swagger-ui').first()).toBeVisible();
  await shot(page, '21-api-docs-swagger', 'OpenAPI / Swagger UI at /api/docs', false);

  // Dark mode and phone layouts.
  const dark = await browser.newPage({ colorScheme: 'dark', viewport: DESKTOP });
  await signIn(dark, 'Taylor Lead');
  await dark.getByRole('link', { name: 'Payments' }).first().click();
  await expect(dark.getByRole('heading', { level: 1 })).toHaveText(/Payments/);
  await shot(dark, '22-dark-mode', 'Dark mode (follows the operating system setting)', false);
  await dark.close();
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await signIn(phone, 'Taylor Lead');
  await shot(phone, '23-mobile-home', 'Phone layout: home', false);
  await phone.getByRole('link', { name: 'Payments' }).first().click();
  await expect(phone.getByRole('heading', { level: 1 })).toHaveText(/Payments/);
  await shot(phone, '24-mobile-team', 'Phone layout: team KPIs', false);
  await phone.close();

  const index = [...titles]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, title]) => ({ name, title }));
  writeFileSync(`${DIR}/index.json`, `${JSON.stringify(index, null, 2)}\n`);
});
