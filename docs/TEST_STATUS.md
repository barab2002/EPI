# Test status

Environment: cloud dev container, Ubuntu 24.04, Node 22.22.0, pnpm 10.28.0, Docker 29.8.2, PostgreSQL 16 (`mirror.gcr.io/library/postgres:16-alpine`), Chromium from `/opt/pw-browsers`.

| When (UTC) | Command | Result |
|---|---|---|
| 2026-10-12 19:25 | `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` | ✅ ALL CHECKS PASSED — secret scan, prettier, eslint (api+web), tsc (api+web), **53 API unit**, **13 web**, **23 API integration** (real Postgres), build |
| 2026-10-12 19:23 | `pnpm run e2e` against `./epi.sh demo` containers (2 consecutive runs) | ✅ 5 passed, 1 skipped by design (mutating flow runs on desktop only) |
| 2026-10-12 19:23 | `./epi.sh backup` → delete assessments → `./epi.sh restore <file> --yes` → `stop`/`start` | ✅ data restored (1 assessment, 860 work items) and retained across restart |
| 2026-10-12 19:21 | `./epi.sh demo` (clean, image already built) | ✅ healthy in ~42 s; first build ~3.5 min |
| 2026-10-12 19:24 | `scripts/check_status.sh`, `scripts/resume.sh --dry-run`, `setup_scheduler.sh` (no flag), `stop_scheduler.sh` | ✅ skip on active session; nothing installed |

## Coverage of spec-required security tests (`apps/api/test/rbac.int.spec.ts`)

Developer ↛ peer profile/KPIs/reviews · team lead ↛ other team · group manager ↛ other group · admin ↛ private review and KPIs · guessed IDs → 404 · unknown query params → 400 · CSRF required · forged session cookie → 401 · demo login refused for non-synthetic users and in production mode · small-group suppression (and not for the managing lead) · assessments: drafts hidden from subject, submit locks (409), audit has no review text · historical attribution across a team transfer.

## Not yet tested

Keycloak/OIDC, Jira/GitLab adapters (not built), offline/egress-blocked install, upgrade/rollback, export paths (no export feature yet), accessibility audit tooling (axe) — manual keyboard checks only.

## Unresolved failures

None. Earlier failures fixed in-session: session lookup bug (see IMPLEMENTATION_LOG), Compose secret file permissions, two e2e timing races.
