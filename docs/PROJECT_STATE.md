# Project state — what actually works (2026-10-12)

**Milestone:** Phase 0 complete; pilot vertical slice 1 working in **demo mode with synthetic data**. Not production-ready.

## Working and verified (tests in `TEST_STATUS.md`)

- **One-command demo:** `./epi.sh demo` builds the image, starts PostgreSQL + EPI via Compose (localhost only), migrates, seeds labeled synthetic data, waits for `/health/ready`. `doctor`, `start/stop/status/logs`, `backup`, `restore` verified.
- **KPI engine (pure, unit-tested):** Cycle Time, Work Item Aging (median/P85/oldest), Review Waiting Time (per reviewer request) and the separately coded proxy `MR_OPEN_TO_FIRST_REVIEW`; confidence classes (N/A < 5, low 5–9, normal ≥ 10); window-over-window trend from raw observations, ±8% exploratory threshold, zero-baseline guard.
- **Data model:** migration for hierarchy, effective-dated memberships/roles/grades, identities, ingestion tables, assessments, KPI snapshots, audit, sessions.
- **Auth & RBAC:** opaque server-side sessions (HttpOnly, SameSite=Lax, CSRF header for mutations); demo login only in demo mode. Scope resolution from EPI DB; out-of-scope = 404; small-group suppression (default 5) for aggregate-only viewers; admin sees structure but not KPIs/reviews.
- **API:** `/health/*`, `/api/v1/me`, organization tree, groups/teams/developers, KPI cards + catalog + explanation, reviews (list, create/update/submit), demo auth. OpenAPI/Swagger at `/api/docs`.
- **UI:** single React app — context-aware home, org → group → team → developer drill-down with breadcrumbs, KPI cards with sample/confidence/freshness/trend, "How calculated?" drawer, monthly assessment form, loading/empty/error/not-found/suppressed states, responsive (desktop + mobile tested), light/dark, localization catalog.
- **Ops scaffolding:** `scripts/ci.sh` (local CI), `.gitlab-ci.yml` for an internal runner, fallback secret scan, hourly resume scheduler scripts (**not enabled**).

## Not implemented yet / known limitations

- Keycloak OIDC login (EPI-003) — production mode refuses to start on purpose.
- Real Jira/GitLab collectors (EPI-006/007), identity mapping and data-quality view (EPI-008).
- Offline bundle, `install`, `upgrade`, `offline-install` (EPI-012) — commands exit 2 with a message.
- KPIs computed on request; `kpi_snapshots` not populated yet. Stratification by work type/complexity not shown in UI yet.
- Admin CRUD screens (groups/teams/memberships/roles), audit viewer, sync status UI.
- Hebrew catalog not written (structure supports it). `PUT /reviews/{id}` replaced by idempotent `POST` upsert.
- Images not pinned by digest; no SBOM/vulnerability scan (tools not installed).
