# Implementation log

- **2026-10-12** — Phase 0: environment discovery, readiness (GO-WITH-GAPS), consolidated access request, architecture, ADR-001..009 (NestJS backend per owner preference), backlog, risks. Workspace + CI scripts.
- **2026-10-12** — KPI engine test-first (Cycle Time, Aging, Review Waiting + proxy, confidence, trends).
- **2026-10-12** — Schema migration, synthetic seed (26 users, 4 teams, transfer, small team), sessions + CSRF, ScopeService RBAC, org/KPI/review APIs, Swagger. Integration tests found and fixed a real bug: TypeORM returns `[rows, count]` for `UPDATE … RETURNING`, which made session lookup accept unknown tokens with an empty user; fixed via `db/rows.ts` + regression tests.
- **2026-10-12** — Unified React UI, Playwright e2e (desktop + mobile), Docker image + Compose + `epi.sh`, backup/restore verified, scheduler scripts (disabled).
- **2026-10-12** — Owner confirmed NestJS, delegated license (Apache-2.0), approved merge (PR #1 → `main` @ `56205d2`) and hourly resume (Routine, ADR-014).
- **2026-10-12** — EPI-003 Keycloak SSO: OIDC BFF with openid-client (PKCE/state/nonce, browser binding, no token storage, no auto-provisioning), production gating, IdP logout, compose overlay, doctor checks; tested against an ephemeral Keycloak (15 integration + browser E2E).
- **2026-10-13** — Scheduled daily sync (ADR-021): `app_settings` table, pure DST-safe due logic, `SyncScheduler` with per-day DB claim, admin schedule API + Integrations card; unit, integration, web and browser E2E tests.
- **2026-10-13** — Audit-log viewer (ADR-022): admin API with filters and keyset paging, assessment redaction, Audit log tab; integration, web and browser E2E tests.
- **2026-10-13** — EPI-012a (ADR-023): images pinned by digest with CI check, license allowlist check, `bundle`/`offline-install` with checksum and image identity verification, offline install test on a no-egress network.
- **2026-10-13** — Owner decisions (ADR-024). EPI-003b (ADR-025): production realm generator, `sso-setup`, `compose.sso.yaml` (Keycloak prod mode, own DB, vault, truststore), synthetic LDAPS directory fixture and SSO e2e.
- **2026-10-13** — UX-01 UI/UX pass complete (PRs #17–#22: design system, 6 slices, CI contrast check, refreshed screenshots). EPI-004c AD team import (ADR-030): `planImport`, directory mappings migration, admin API (preview/apply with plan hash), Directory tab, `directory-check`, compose wiring; fixed `sso.conf` loading in `epi.sh`.
- **2026-10-13** — EPI-012c `./epi.sh upgrade` with automatic rollback (ADR-031) and `scripts/test-upgrade.sh`; `offline-install` and `upgrade` share bundle verification and image loading.
- **2026-10-13** — Data retention (ADR-032): `RetentionService` (daily, one transaction, audited), `retention` CLI, admin view on Data quality; assessments/people kept pending HR.
- **2026-10-13** — Administration › Settings (ADR-033): connections editable in the UI with Test connection, token presence only, `EPI_SOURCE_HOSTS` allow-list; minimum group size 3 (ADR-034).
- **2026-10-13** — Hebrew UI stage 1 (ADR-035): typed he catalog, per-user locale (`users.locale`, `PUT /me/locale`), language switch, RTL, Hebrew Intl formatting, layout guard in Hebrew.
- **2026-10-13** — Hebrew UI stage 2 (ADR-035): administration screens via typed `i18n-admin.ts`, audit actions/resources translated, Hebrew layout guard covers all admin tabs.
- **2026-10-13** — Source tokens on the server (ADR-036): found that Settings-added connections could not see their token in the Compose stack; `.epi/sources` mounted read-only, `./epi.sh source-token`, `./epi.sh source-ca` (company CA via `NODE_EXTRA_CA_CERTS`), proven in the offline install test.
