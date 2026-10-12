# Architecture & product decisions (ADR log)

Format: ID · date · status · decision · rationale · consequences. Newest last.

## ADR-001 · 2026-10-12 · Accepted — Backend in NestJS (TypeScript) instead of FastAPI

- **Context:** Master Spec §2/§6/§11 names FastAPI + SQLAlchemy/Alembic/Pydantic. The project owner's standing preference is JS/TS with **NestJS and Swagger**, and there is one developer who must maintain the code.
- **Decision:** `epi-api` is NestJS 11 (TypeScript 5.9) with `@nestjs/swagger` for the generated, versioned OpenAPI document, TypeORM 0.3 with **hand-written SQL migrations** for PostgreSQL, and `class-validator` DTOs in place of Pydantic.
- **Why:** one language across frontend and backend; the owner can maintain it; every spec requirement (OpenAPI, migrations, RBAC service layer, ingestion jobs, KPI engine) is covered. Licenses: NestJS MIT, TypeORM MIT, pg MIT.
- **Consequences:** Spec references to Python tooling (pytest, Ruff, mypy, `Protocol`) map to Jest, ESLint/Prettier, `tsc --noEmit` and TS interfaces. The architecture shape is unchanged: single API + single UI + PostgreSQL + Keycloak. **Reversible only cheaply now** — owner should object before EPI-004 if FastAPI is required.

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
