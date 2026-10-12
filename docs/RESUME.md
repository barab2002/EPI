# Resume point

status: active — EPI-008 IN PROGRESS on `feature/identity-mapping`

- **main** contains: Phase 0, vertical slice 1, EPI-003 Keycloak SSO, demo Keycloak (PRs #1–#3), EPI-006 Jira collector, screenshots and EPI-007 GitLab collector (PRs #1–#7, main @ `88f89f2`).
- **In progress:** `feature/identity-mapping` from main @ `88f89f2`. Steps: (1) migration: `source_accounts` + external IDs on work_items/merge_requests, collectors record them; (2) admin API: identities list/map/unmap with attribution backfill, unmapped accounts, user search, data-quality, all audited + RBAC tests; (3) admin UI (integrations + sync now, identity mapping, status mappings, data quality) + web tests; (4) e2e + screenshots, docs, CI, PR, merge. `git log` on the branch shows which steps are done.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
