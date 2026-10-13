# EPI architecture

## Components (MVP deployment units)

```
 Browser ──HTTPS──▶ epi-api (NestJS) ──▶ postgres (epi DB)
   (one UI,          │  serves built epi-web static files
    session cookie)  │  /api/v1/*  REST + OpenAPI (/api/docs)
                     │  auth (OIDC BFF) · RBAC scope filter · audit
                     │  KPI engine (pure functions) · ingestion jobs
                     ├──OIDC──▶ keycloak (own DB/credentials)      [EPI-003]
                     ├──read-only LDAPS──▶ AD team groups         [EPI-004c]
                     └──read-only REST──▶ Jira DC, GitLab 18+     [EPI-006/007]
```

- **epi-web** (`apps/web`): React 19 + Vite + TypeScript SPA. Built to static assets and served by epi-api in production (single container, single origin → no CORS, simple cookies). No runtime CDN/fonts.
- **epi-api** (`apps/api`): NestJS 11. Modules: `health`, `auth`, `org` (hierarchy + RBAC scopes), `kpi` (engine + catalog + snapshots), `reviews`, `admin`, `ingestion`. OpenAPI at `/api/docs` (Swagger UI) and `/api/docs-json`.
- **postgres**: PostgreSQL 16. Schema managed by TypeORM migrations containing explicit SQL (`apps/api/src/db/migrations`).
- **keycloak**: authentication only; EPI DB owns authorization.

No Redis/Kafka/Celery/Grafana/DevLake. Background sync runs in-process (daily `SyncScheduler`, ADR-021) or via `epi-api` CLI command.

## Security boundaries

1. **Authentication:** server-side session (HttpOnly cookie) created after OIDC code+PKCE; demo login exists only when `EPI_MODE=demo` (ADR-005).
2. **Authorization:** `ScopeService` resolves the caller's effective-dated role assignments into an allowed set of team IDs / user IDs. Every query on org, KPI, review and export paths is filtered by that set **in SQL**; path IDs are never trusted. Private review content requires a separate permission from aggregate metrics; Admin role does not grant it.
3. **Small-group suppression:** aggregates for an entity with fewer than `minimum_aggregate_size` people are returned as `suppressed` (no value).
4. **Audit:** admin and review mutations write `audit_events` (no secrets/review text in metadata).
5. **Secrets:** environment / mounted files only; `secret_ref` names in DB, never values.
6. **Source systems:** read-only tokens; no writeback.
7. **Directory:** EPI binds to AD with the read-only account (password and CA from mounted files), reads only the configured team groups' members (name, e-mail, username, ID) and never writes; imports change EPI only after an administrator previews and applies the exact plan (ADR-030).

## Data flow (KPIs)

Jira/GitLab (or synthetic seed) → `work_items`, `work_events`, `merge_requests`, `review_events` (idempotent upserts keyed by external IDs) → KPI engine computes from raw observations per entity & window → `kpi_snapshots` (value, sample size, confidence, formula version) → API → KPI card + "How calculated?" drawer.

## Deployment

`./epi.sh demo` → Docker Compose (`deploy/compose.yaml`): `postgres` + `epi` (api + web). Third-party images are pinned by digest in `deploy/images.lock`. Air-gapped hosts: `./epi.sh bundle` → `./epi.sh offline-install` (`docs/OFFLINE_INSTALL.md`, ADR-023); the installation only uses bundled images (`pull_policy: never`). Keycloak: `deploy/compose.oidc.yaml` (production) or the demo overlay.
