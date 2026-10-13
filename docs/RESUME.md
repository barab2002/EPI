# Resume point

status: active — EPI-012a offline bundle IN PROGRESS on `feature/offline-bundle` (from main @ `4000376`)

- **main** contains PRs #1–#10 (… EPI-004b organization admin, scheduled daily sync); PR #11 audit-log viewer (ADR-022) merged @ `4000376`.
- **Next task:** EPI-012a on `feature/offline-bundle` from `main` — see `NEXT_ACTIONS.md` #2 (pinned digests, `./epi.sh bundle` / `offline-install`, egress-blocked install test, license inventory). Start by reading `epi.sh` (install/upgrade/offline-install/bundle currently exit 2) and `deploy/Dockerfile`/`compose*.yaml`.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
