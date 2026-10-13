# Resume point

status: active — EPI-012a offline bundle IN PROGRESS on `feature/offline-bundle` (from main @ `4000376`)

- **main** contains PRs #1–#10 (… EPI-004b organization admin, scheduled daily sync); PR #11 audit-log viewer (ADR-022) merged @ `4000376`.
- **EPI-012a progress:** (1) ✅ images pinned by digest — `deploy/images.lock`, `scripts/images.sh` (sourced by epi.sh/test scripts), `scripts/pin-images.sh`, `scripts/check-pins.sh` in CI, compose `pull_policy`. (2) NEXT: license inventory `scripts/license-report.mjs` from `pnpm licenses list --prod --json` (deny AGPL/GPL/SSPL/unknown) → CI step. (3) `./epi.sh bundle` (retag pinned images to `epi-bundle/*`, docker save, compose/epi.sh/scripts, licenses, SHA256SUMS, `deploy/offline.env`) + `./epi.sh offline-install <tar>` (verify sums, extract, docker load, verify image IDs, start with `EPI_PULL_POLICY=never`); demo realm generation falls back to node inside the epi image when host has no node. (4) `scripts/test-offline-install.sh`: bundle → remove `epi-bundle/*` tags → install into temp dir → start with compose network `internal: true` (no egress) → container health → stop/cleanup. (5) docs (INSTALL/OFFLINE, ADR-023), CI, PR, merge.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
