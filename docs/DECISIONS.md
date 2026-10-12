# Architecture & product decisions (ADR log)

Format: ID · date · status · decision · rationale · consequences. Newest last.

## ADR-001 · 2026-10-12 · Accepted (owner confirmed 2026-10-12) — Backend in NestJS (TypeScript) instead of FastAPI

- **Context:** Master Spec §2/§6/§11 names FastAPI + SQLAlchemy/Alembic/Pydantic. The project owner's standing preference is JS/TS with **NestJS and Swagger**, and there is one developer who must maintain the code.
- **Decision:** `epi-api` is NestJS 11 (TypeScript 5.9) with `@nestjs/swagger` for the generated, versioned OpenAPI document, TypeORM 0.3 with **hand-written SQL migrations** for PostgreSQL, and `class-validator` DTOs in place of Pydantic.
- **Why:** one language across frontend and backend; the owner can maintain it; every spec requirement (OpenAPI, migrations, RBAC service layer, ingestion jobs, KPI engine) is covered. Licenses: NestJS MIT, TypeORM MIT, pg MIT.
- **Consequences:** Spec references to Python tooling (pytest, Ruff, mypy, `Protocol`) map to Jest, ESLint/Prettier, `tsc --noEmit` and TS interfaces. The architecture shape is unchanged: single API + single UI + PostgreSQL + Keycloak. Owner confirmed NestJS on 2026-10-12.

## ADR-002 · 2026-10-12 · Accepted — Doc set: CLAUDE.md list is canonical

- **Conflict:** Spec §0 asks for `READINESS.md`, `IMPLEMENTATION_PLAN.md`, `PROGRESS.md`, `OPEN_QUESTIONS.md`; CLAUDE.md/CLAUDE_START.md ask for a different set.
- **Decision:** Keep CLAUDE.md's set. `READINESS.md` holds the tool inventory and GO/NO-GO verdict; `ACCESS_REQUIREMENTS.md` holds the consolidated request **and** open questions; `BACKLOG.md` holds the implementation plan; `PROJECT_STATE.md` + `IMPLEMENTATION_LOG.md` replace `PROGRESS.md`. Avoids duplicate documents.

## ADR-003 · 2026-10-12 · Accepted — Monorepo with pnpm workspaces

`apps/api` (NestJS), `apps/web` (React 19 + Vite 7 + TypeScript). One lockfile (`pnpm-lock.yaml`) pins everything, which is needed for offline builds. No shared package until duplication justifies it.

## ADR-004 · 2026-10-12 · Accepted — No Tailwind/shadcn in slice 1; plain CSS design tokens

Spec suggests Tailwind/shadcn. For the first slice a small hand-written CSS token system (light/dark, RTL-safe logical properties) and inline-SVG sparklines avoid a build plugin, a component generator and a chart library. Revisit if UI surface grows enough to justify them. No external fonts/CDNs (offline).

## ADR-005 · 2026-10-12 · Accepted — Auth: server-side session (BFF) with OIDC; demo login only in demo mode

- Production: Keycloak OIDC Authorization Code + PKCE handled **by the API** (`openid-client`); the browser only receives an opaque `HttpOnly; SameSite=Lax; Secure` session cookie. Sessions stored in PostgreSQL. Mutations require a CSRF header token.
- Demo mode (`EPI_MODE=demo`): a "choose synthetic user" login that is **refused at startup unless mode=demo**, so seeded RBAC can be demonstrated without Keycloak. Keycloak in Compose arrives with EPI-003.
- Authorization never comes from the IdP's roles: the EPI DB owns role assignments and scopes (spec §5).

## ADR-006 · 2026-10-12 · Accepted — CI: local script first; GitLab CI file provided, no public CI

Remote is currently GitHub (`barab2002/EPI`). Spec forbids relying on public CI. `scripts/ci.sh` is the single source of checks; `.gitlab-ci.yml` calls it for an internal runner. No GitHub Actions workflow is added without approval.

## ADR-007 · 2026-10-12 · Accepted — Test stack

API: Jest + ts-jest + supertest; integration tests against a real PostgreSQL 16 (`EPI_TEST_DATABASE_URL`, started by `scripts/test-db.sh` via Docker). Web: Vitest + Testing Library + jsdom. E2E: Playwright (pre-installed Chromium) — added with EPI-010.

## ADR-008 · 2026-10-12 · Accepted — KPI engine as pure functions

KPI math lives in `apps/api/src/kpi/engine` with no DB or framework imports, so formulas are unit-tested exhaustively and the explanation endpoint can show the exact implementation version. Snapshots are computed from raw observations (spec §14: 90-day trends from raw observations, never from averaged monthly medians).

## ADR-009 · 2026-10-12 · Accepted — Container images via mirror in this dev environment

Docker Hub returns HTTP 429 from this sandbox; `mirror.gcr.io/library/*` works. Compose files reference images through an `EPI_IMAGE_REGISTRY` variable (default `docker.io`) so an internal registry/mirror can be substituted without editing files. Production images must still be pinned by digest (EPI-012).

## ADR-010 · 2026-10-12 · Accepted — KPIs computed on request in slice 1

For pilot scale (2–4 teams, ≤6 months) KPI cards are computed per request from raw events, so results always match the current formula version and need no backfill job. `kpi_snapshots` (already in the schema) will be filled by a scheduled job when history charts or scale require it.

## ADR-011 · 2026-10-12 · Accepted — Developer KPI page shows flow KPIs only

Review Waiting Time is shown for team/group/org only. Spec: never interpret reviewer waiting as the author's productivity; showing it on a person's page invites that reading.

## ADR-012 · 2026-10-12 · Accepted — Commits authored solely by the project owner

Per the owner's standing instruction ("any change … under my name only"), commits use the owner's GitHub identity via repo-local git config and carry no co-author trailer.

## ADR-013 · 2026-10-12 · Accepted — License: Apache-2.0

Owner delegated the choice. Apache-2.0: permissive, OSI-approved, explicit patent grant, compatible with the MIT/ISC/BSD/Apache dependencies used so far (NestJS, TypeORM, React, Vite, pg). `LICENSE` + `NOTICE` at repo root; dependency license inventory (SBOM) follows in EPI-012.

## ADR-014 · 2026-10-12 · Accepted — Hourly resume via a Claude Code Routine in this cloud environment

Owner approved the hourly resume scheduler. The dev container is ephemeral (reclaimed when idle), so an in-container cron would not survive. The scheduler is therefore a Claude Code Routine (`EPI hourly resume`, trigger `trig_01KXpTGZKMatHx36donkyqXL`, minute :32 hourly) that wakes the same session; queued wakes cannot overlap a running turn. Its prompt applies the same guards as `scripts/resume.sh`: skip when blocked/awaiting approval/complete, one bounded task, feature branches only, no merges/PRs/network exposure/real data without explicit approval, stop after a repeated failure. `scripts/setup_scheduler.sh --approved` remains the mechanism for an always-on on-prem host. Stop: ask in chat or delete the Routine.

## ADR-015 · 2026-10-12 · Accepted — OIDC as BFF with openid-client v6; no token storage

- `openid-client` (MIT, OpenID-certified) handles discovery, PKCE, code exchange and ID-token validation. It is ESM-only; Node 22 loads it from the CommonJS build natively, and Jest transpiles only it and its two dependencies (`oauth4webapi`, `jose`) for tests.
- No access/refresh/ID tokens are stored; EPI only needs identity. Trade-off: Keycloak shows a logout confirmation (no `id_token_hint`).
- No auto-provisioning; mapping by `sub`, optional verified-e-mail linking (default off).
- Real deployments point to the corporate/dedicated Keycloak via `deploy/compose.oidc.yaml`; tests use an ephemeral Keycloak on the host. (Demo bundling: ADR-016.)

## ADR-016 · 2026-10-12 · Accepted — Demo bundles a dev-mode Keycloak with generated users

Owner has no Keycloak and asked for ready-made users. `./epi.sh demo` adds `deploy/compose.demo-sso.yaml`: Keycloak 26.3.3 in dev mode (file DB in a volume), realm `epi-demo` generated per install by `scripts/kc-demo-realm.mjs` with one user per demo role, random passwords and client secret kept only in `.epi/keycloak/` (0700, gitignored) and shown by `./epi.sh credentials`. Users link to synthetic EPI people by verified e-mail (enabled in demo only; the seed leaves `keycloak_sub` empty). Split-horizon issuer solved with `EPI_OIDC_INTERNAL_URL` (openid-client `customFetch`): browser uses `127.0.0.1:8081`, EPI's back channel uses `keycloak:8080`, the issuer stays the public URL. `/auth/login` restarts on `EPI_PUBLIC_URL` when opened under another host name so the binding cookie and callback share a host. Not for real users: production uses the organization's Keycloak.

## ADR-017 · 2026-10-12 · Accepted — Jira collector: REST, metadata only, relative JQL

- **REST, not MCP** (spec §7 MCP rule): no approved, locally runnable Jira DC MCP server is available; REST through the `EngineeringSource`-style client is deterministic and testable. Revisit if one is approved (B8).
- **Metadata only:** no summary/description/comments are requested or stored (`title`, `raw_json` stay NULL). Drill-down shows issue keys.
- **Relative JQL time** (`updated >= "-Nm"`) avoids the Jira user-time-zone ambiguity of absolute JQL dates; 48 h overlap absorbs late edits.
- **Status mapping by status ID** (names can be renamed), inferred from Jira status categories, admin-overridable; admin rows are never overwritten.
- **Attribution:** current assignee (documented limitation). Story Points stored only when the field is confirmed or unambiguous.
- **Tests:** an in-process fake Jira DC server (synthetic data, documented response shapes, fault injection) — real-instance reconciliation (spec §14: 20 issues) awaits access B1–B3.

## ADR-018 · 2026-10-12 · Accepted — GitLab collector: REST, review events from system notes

- **REST v4, not MCP** (no approved local GitLab MCP server; same rule as ADR-017). Token scope `read_api` only.
- **Reviewer-request time** comes from GitLab's "requested review from @…" system notes (GitLab ≥ 13.8), one event per requested reviewer; this enables the preferred KPI-03 definition rather than the proxy. Approvals come from "approved this merge request" system notes; all other system notes are dropped as non-substantive.
- **Metadata only:** titles, descriptions and note bodies are never stored; bodies are read in memory only to classify system notes.
- **Bots:** GitLab `bot` flag, project/group bot naming, well-known bot names and a configurable list.
- **Unmapped reviewers:** requests and notes keep the GitLab user ID (`actor_external_id`), so waits are measured for the author's team even before every reviewer is mapped; individual attribution still requires a verified identity.
- **Shared sync-run helpers** (`ingestion/sync-runs.ts`) enforce the same cursor/overlap/one-run rules for Jira and GitLab.

## ADR-019 · 2026-10-12 · Accepted — Identity mapping by verified source IDs, re-attributing history

- People are linked to Jira/GitLab accounts only through explicit `external_identities` set by an administrator (or verified-e-mail SSO linking, ADR-016) — never by display name (spec §7).
- Collectors store external IDs on records (`assignee_external_id`, `author_external_id`, `actor_external_id`) and list seen accounts in `source_accounts` (display names kept only for the admin mapping screen), so a mapping made later re-attributes existing data and an unmapping removes attribution; both are audited.
- One account per person and source; bot accounts cannot be mapped.
- Data quality is a first-class admin page: freshness (stale after 26 h), mapping coverage, MR-to-Jira link rate, statuses without category.
