# Project state — what actually works (2026-10-12)

**Milestone:** On `main`: vertical slice 1, Keycloak SSO (EPI-003) and demo Keycloak. EPI-006 Jira collector (PR #4). Demo uses synthetic data. Not production-ready (no real Jira/GitLab connected, no offline bundle).

## Working and verified (tests in `TEST_STATUS.md`)

- **One-command demo:** `./epi.sh demo` builds the image, starts PostgreSQL + EPI via Compose (localhost only), migrates, seeds labeled synthetic data, waits for `/health/ready`. `doctor`, `start/stop/status/logs`, `backup`, `restore` verified.
- **KPI engine (pure, unit-tested):** Cycle Time, Work Item Aging (median/P85/oldest), Review Waiting Time (per reviewer request) and the separately coded proxy `MR_OPEN_TO_FIRST_REVIEW`; confidence classes (N/A < 5, low 5–9, normal ≥ 10); window-over-window trend from raw observations, ±8% exploratory threshold, zero-baseline guard.
- **Data model:** migration for hierarchy, effective-dated memberships/roles/grades, identities, ingestion tables, assessments, KPI snapshots, audit, sessions.
- **SSO (EPI-003):** Keycloak/OIDC sign-in (code + PKCE, state, nonce, browser binding, no token storage, no auto-provisioning), IdP logout, production mode gated on OIDC + https. Verified against a real ephemeral Keycloak (API integration + browser E2E). See `KEYCLOAK.md`.
- **Jira DC collector (EPI-006):** read-only REST client (paging, retries, timeouts), relative-time incremental JQL with 48 h overlap and 6-month backfill, status mapping by ID (inferred + admin override), metadata-only idempotent upserts, safe cursor, one run per connection; CLI `jira-add/check/sync`; admin API for integrations, sync runs and status mappings. Verified against a fake Jira DC (see `JIRA.md`).
- **Demo SSO:** bundled dev-mode Keycloak with generated per-install users (`./epi.sh credentials`).
- **Auth & RBAC:** opaque server-side sessions (HttpOnly, SameSite=Lax, CSRF header for mutations); demo login only in demo mode. Scope resolution from EPI DB; out-of-scope = 404; small-group suppression (default 5) for aggregate-only viewers; admin sees structure but not KPIs/reviews.
- **API:** `/health/*`, `/api/v1/me`, organization tree, groups/teams/developers, KPI cards + catalog + explanation, reviews (list, create/update/submit), demo auth. OpenAPI/Swagger at `/api/docs`.
- **UI:** single React app — context-aware home, org → group → team → developer drill-down with breadcrumbs, KPI cards with sample/confidence/freshness/trend, "How calculated?" drawer, monthly assessment form, loading/empty/error/not-found/suppressed states, responsive (desktop + mobile tested), light/dark, localization catalog.
- **Ops scaffolding:** `scripts/ci.sh` (local CI), `.gitlab-ci.yml` for an internal runner, fallback secret scan, hourly resume scheduler scripts (**not enabled**).

## Not implemented yet / known limitations

- No real Keycloak realm connected yet (needs C1). Demo Compose has no bundled Keycloak (ADR-015). Admin screen for identity mapping pending (EPI-008).
- No real Jira connected (needs B1–B3); GitLab collector (EPI-007); identity-mapping and data-quality UI (EPI-008); deleted-issue reconciliation; sprint data.
- Offline bundle, `install`, `upgrade`, `offline-install` (EPI-012) — commands exit 2 with a message.
- KPIs computed on request; `kpi_snapshots` not populated yet. Stratification by work type/complexity not shown in UI yet.
- Admin CRUD screens (groups/teams/memberships/roles), audit viewer, sync status UI.
- Hebrew catalog not written (structure supports it). `PUT /reviews/{id}` replaced by idempotent `POST` upsert.
- Images not pinned by digest; no SBOM/vulnerability scan (tools not installed).
