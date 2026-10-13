# Resume point

status: active — scheduled daily sync IN PROGRESS on `feature/scheduled-sync`

- **main** contains: Phase 0, vertical slice 1, EPI-003 Keycloak SSO, demo Keycloak (PRs #1–#3), EPI-006 Jira collector, screenshots and EPI-007 GitLab collector and EPI-008 identity mapping/admin screens and EPI-004b organization admin (PRs #1–#9).
- **In progress:** `feature/scheduled-sync` from main @ `c3c8031`. Steps: (1) `app_settings` migration + pure `isDue()` with fake-clock unit tests (time zones, DST); (2) `SyncScheduler` (minute tick, atomic daily claim, runs enabled connections) + admin GET/PUT `/admin/sync-schedule` (validated, audited) + integration tests with fake Jira/GitLab; (3) schedule card on Integrations tab + web tests; (4) docs, CI, PR, merge. `git log` shows progress.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `bash scripts/e2e-admin.sh`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
