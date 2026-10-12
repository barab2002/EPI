# EPI screenshots

Captured 2026-10-12 from `./epi.sh demo` (Docker Compose, bundled demo Keycloak) with Playwright/Chromium. **All people and data are synthetic.** Regenerate after UI changes (see “How these were made” below).

## Sign-in

### Sign-in page: single sign-on button and demo people (synthetic)

![Sign-in page: single sign-on button and demo people (synthetic)](screenshots/01-sign-in.png)

### Keycloak login page (demo realm epi-demo)

![Keycloak login page (demo realm epi-demo)](screenshots/02-keycloak-login.png)

### Team lead home after SSO sign-in: own KPIs and managed team

![Team lead home after SSO sign-in: own KPIs and managed team](screenshots/03-home-team-lead-sso.png)

### Sign-in refused (no EPI account): clear message, no auto-provisioning

![Sign-in refused (no EPI account): clear message, no auto-provisioning](screenshots/20-sso-refused-message.png)

## Role-based home pages

### Engineering manager home: organization KPIs and managed teams

![Engineering manager home: organization KPIs and managed teams](screenshots/04-home-engineering-manager.png)

### Developer home: own flow KPIs and team aggregate (no member-level evidence)

![Developer home: own flow KPIs and team aggregate (no member-level evidence)](screenshots/15-home-developer.png)

### Privacy: team aggregate hidden for a 3-person team (minimum 5)

![Privacy: team aggregate hidden for a 3-person team (minimum 5)](screenshots/17-small-team-suppressed.png)

### Administrator: organization structure only — no KPIs or private reviews

![Administrator: organization structure only — no KPIs or private reviews](screenshots/18-admin-structure-only.png)

## Drill-down: organization → group → team → developer

### Organization → group → team tree with access badges

![Organization → group → team tree with access badges](screenshots/05-organization-tree.png)

### Group overview: group KPIs with trends and its teams

![Group overview: group KPIs with trends and its teams](screenshots/06-group-overview.png)

### Team overview (managed): KPI cards, trend, sample, confidence, freshness, members

![Team overview (managed): KPI cards, trend, sample, confidence, freshness, members](screenshots/07-team-overview.png)

### Developer profile (manager view): grade, team, flow KPIs, assessments

![Developer profile (manager view): grade, team, flow KPIs, assessments](screenshots/11-developer-profile.png)

### Out-of-scope team opened by URL: “Not available” (server returns 404)

![Out-of-scope team opened by URL: “Not available” (server returns 404)](screenshots/14-out-of-scope.png)

## Explainable KPIs

### Switching the KPI window (30/90/180 days)

![Switching the KPI window (30/90/180 days)](screenshots/08-kpi-window-180d.png)

### "How calculated?" drawer: formula, population, source, window, version, exclusions

!["How calculated?" drawer: formula, population, source, window, version, exclusions](screenshots/09-kpi-explanation-drawer.png)

### Drawer continued: limitations, worked example computed by the engine, items behind the value

![Drawer continued: limitations, worked example computed by the engine, items behind the value](screenshots/10-kpi-evidence.png)

### KPI catalog: versioned definitions, units, direction, scopes

![KPI catalog: versioned definitions, units, direction, scopes](screenshots/19-kpi-catalog.png)

## Monthly assessments

### Monthly manager assessment: anchored 1–5 rubrics with required evidence

![Monthly manager assessment: anchored 1–5 rubrics with required evidence](screenshots/12-assessment-form.png)

### Submitted assessment (locked) in the developer profile

![Submitted assessment (locked) in the developer profile](screenshots/13-assessment-submitted.png)

### Reviews: the developer sees submitted assessments about themselves

![Reviews: the developer sees submitted assessments about themselves](screenshots/16-reviews-developer.png)

## Responsive, dark mode and API

### Dark mode (follows the operating system setting)

![Dark mode (follows the operating system setting)](screenshots/22-dark-mode.png)

### Mobile layout: home

![Mobile layout: home](screenshots/23-mobile-home.png)

### Mobile layout: team KPIs

![Mobile layout: team KPIs](screenshots/24-mobile-team.png)

### OpenAPI / Swagger UI at /api/docs

![OpenAPI / Swagger UI at /api/docs](screenshots/21-api-docs-swagger.png)

## How these were made

1. `./epi.sh demo` (signs-in users from `./epi.sh credentials`).
2. A Playwright script signs in as each demo role (demo sign-in and Keycloak SSO for `taylor`), navigates every screen at 1366×900, Pixel 7 and dark color scheme, and saves PNGs here; `screenshots/index.json` lists file → caption.
3. No passwords appear in any screenshot (the Keycloak page is captured before the password is typed).

Known UI nit visible in the mobile shots: the top navigation wraps “My view” onto two lines (tracked in `NEXT_ACTIONS.md`).
