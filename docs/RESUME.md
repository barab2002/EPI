# Resume point

status: active — audit-log viewer DONE (PR #11, CI green); next: EPI-012a offline bundle

- **main** contains PRs #1–#10 (… EPI-004b organization admin, scheduled daily sync); PR #11 `feature/audit-log` (ADR-022) merged per standing approval.
- **Next task:** EPI-012a on `feature/offline-bundle` from `main` — see `NEXT_ACTIONS.md` #2 (pinned digests, `./epi.sh bundle` / `offline-install`, egress-blocked install test, license inventory). Start by reading `epi.sh` (install/upgrade/offline-install/bundle currently exit 2) and `deploy/Dockerfile`/`compose*.yaml`.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
