# EPI screenshots

Captured 2026-10-12, refreshed 2026-10-13 after the UI/UX pass (UX-01), from `./epi.sh demo` (Docker Compose, bundled demo Keycloak) with Playwright/Chromium. **All people and data are synthetic.** Regenerate after UI changes (see “How these were made” below).

## Sign-in

### Sign-in page: single sign-on, demo people grouped by role (synthetic)

![Sign-in page: single sign-on, demo people grouped by role (synthetic)](screenshots/01-sign-in.png)

### Keycloak login page (demo realm epi-demo)

![Keycloak login page (demo realm epi-demo)](screenshots/02-keycloak-login.png)

### Team lead home: assessments to write this month, team overview, own KPIs

![Team lead home: assessments to write this month, team overview, own KPIs](screenshots/03-home-team-lead-sso.png)

### Sign-in refused (no EPI account): clear message, no auto-provisioning

![Sign-in refused (no EPI account): clear message, no auto-provisioning](screenshots/20-sso-refused-message.png)

## Role-based home pages

### Engineering manager home: organization KPIs and teams

![Engineering manager home: organization KPIs and teams](screenshots/04-home-engineering-manager.png)

### Developer home: own flow KPIs and team aggregate (no member-level evidence)

![Developer home: own flow KPIs and team aggregate (no member-level evidence)](screenshots/15-home-developer.png)

### Privacy: team aggregate hidden for a 3-person team (minimum 5)

![Privacy: team aggregate hidden for a 3-person team (minimum 5)](screenshots/17-small-team-suppressed.png)

### Administrator: organization structure only — no KPIs or private reviews

![Administrator: organization structure only — no KPIs or private reviews](screenshots/18-admin-structure-only.png)

## Drill-down: organization → group → team → developer

### Organization → group → team tree with access badges

![Organization → group → team tree with access badges](screenshots/05-organization-tree.png)

### Group overview: group KPIs and its teams (alphabetical, never ranked)

![Group overview: group KPIs and its teams (alphabetical, never ranked)](screenshots/06-group-overview.png)

### Team overview (managed): KPI strip with trend, sample, confidence and freshness; members

![Team overview (managed): KPI strip with trend, sample, confidence and freshness; members](screenshots/07-team-overview.png)

### Developer profile (manager view): grade, team, flow KPIs with neutral trends, assessments

![Developer profile (manager view): grade, team, flow KPIs with neutral trends, assessments](screenshots/11-developer-profile.png)

### Out-of-scope team opened by URL: “Not available” (server returns 404)

![Out-of-scope team opened by URL: “Not available” (server returns 404)](screenshots/14-out-of-scope.png)

## Explainable KPIs

### Switching the KPI window (30/90/180 days; kept in the URL)

![Switching the KPI window (30/90/180 days; kept in the URL)](screenshots/08-kpi-window-180d.png)

### "How calculated?" sheet: formula, population, source, window, version, exclusions

!["How calculated?" sheet: formula, population, source, window, version, exclusions](screenshots/09-kpi-explanation-drawer.png)

### Sheet continued: limitations, worked example computed by the engine, items behind the value

![Sheet continued: limitations, worked example computed by the engine, items behind the value](screenshots/10-kpi-evidence.png)

### KPI catalog: versioned definitions, units, direction, scopes

![KPI catalog: versioned definitions, units, direction, scopes](screenshots/19-kpi-catalog.png)

## Monthly assessments

### Monthly manager assessment: anchored 1–5 rubrics with required evidence

![Monthly manager assessment: anchored 1–5 rubrics with required evidence](screenshots/12-assessment-form.png)

### After submitting: lasting confirmation; the assessment is locked for the month

![After submitting: lasting confirmation; the assessment is locked for the month](screenshots/13-assessment-submitted.png)

### Reviews: the developer sees submitted assessments about themselves

![Reviews: the developer sees submitted assessments about themselves](screenshots/16-reviews-developer.png)

## Responsive, dark mode and API

### Dark mode (follows the operating system setting)

![Dark mode (follows the operating system setting)](screenshots/22-dark-mode.png)

### Phone layout: home

![Phone layout: home](screenshots/23-mobile-home.png)

### Phone layout: team KPIs

![Phone layout: team KPIs](screenshots/24-mobile-team.png)

### OpenAPI / Swagger UI at /api/docs

![OpenAPI / Swagger UI at /api/docs](screenshots/21-api-docs-swagger.png)


## Administration (identity mapping and data quality)

Captured by `scripts/e2e-admin.sh --screenshots`: EPI synced against in-process fake Jira DC and GitLab servers (synthetic data).

### Administration › Integrations: Jira/GitLab connections, Sync now, recent runs (fake sources, synthetic data)

![Administration › Integrations: Jira/GitLab connections, Sync now, recent runs (fake sources, synthetic data)](screenshots/25-admin-integrations.png)

### Administration › Identity mapping: accounts seen in syncs, mapped to EPI people by search

![Administration › Identity mapping: accounts seen in syncs, mapped to EPI people by search](screenshots/26-admin-identity-mapping.png)

### Administration › Status mappings: Jira status → EPI category, inferred vs admin-confirmed

![Administration › Status mappings: Jira status → EPI category, inferred vs admin-confirmed](screenshots/27-admin-status-mappings.png)

### Administration › Data quality: freshness, identity coverage, MR-to-Jira links, unmapped statuses

![Administration › Data quality: freshness, identity coverage, MR-to-Jira links, unmapped statuses](screenshots/28-admin-data-quality.png)

### Administration › Organization: groups and teams, members with dates, add/transfer and end memberships

![Administration › Organization: groups and teams, members with dates, add/transfer and end memberships](screenshots/29-admin-organization.png)

### Administration › People: create a person, assign roles on a scope, grade history

![Administration › People: create a person, assign roles on a scope, grade history](screenshots/30-admin-people.png)

### Administration › Audit log: who changed what and when, filterable; review subjects and text never shown

![Administration › Audit log: who changed what and when, filterable; review subjects and text never shown](screenshots/31-admin-audit-log.png)

### Administration › Directory: AD team groups mapped to EPI teams, preview of every change before applying (synthetic directory)

![Administration › Directory: AD team groups mapped to EPI teams, preview of every change before applying (synthetic directory)](screenshots/32-admin-directory.png)

## How these were made

1. `./epi.sh demo` (synthetic people only).
2. `EPI_DOC_SHOTS=1 npx playwright test e2e/doc-screenshots.spec.ts --project=desktop` signs in as each demo role, visits every screen at 1366×900, in dark mode and at phone width (390×844), saves the PNGs here and rewrites `screenshots/index.json` (file → caption). It submits one synthetic assessment for the demo person Dana Dev; re-runs find it already submitted.
3. Admin shots (25–32) come from `scripts/e2e-admin.sh --screenshots` (fake Jira/GitLab, synthetic LDAPS directory).
4. The Keycloak page (02) is Keycloak's own, captured before any password is typed; no password appears in any screenshot.
