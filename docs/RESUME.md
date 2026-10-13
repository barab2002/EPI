# Resume point

status: active — audit-log viewer IN PROGRESS on `feature/audit-log` (from main @ `8892273`)

- **main** contains PRs #1–#9 (Phase 0 … EPI-004b organization admin); PR #10 scheduled daily sync (ADR-021) merged @ `8892273`.
- **Next task:** audit-log viewer on `feature/audit-log` from `main` — see `NEXT_ACTIONS.md` #2. Plan: admin-only `GET /api/v1/admin/audit-events` (filters action/actor/date range, keyset pagination, metadata shown as-is — it never holds review text or personal values) + integration tests (non-admin 403, filters, no review text) → "Audit log" admin tab + web test → e2e step + screenshot → docs → CI → PR → merge.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `bash scripts/e2e-admin.sh` (needs `pnpm -r run build`); SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
