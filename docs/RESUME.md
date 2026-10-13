# Resume point

status: active — EPI-004b IN PROGRESS on `feature/org-admin`

- **main** contains: Phase 0, vertical slice 1, EPI-003 Keycloak SSO, demo Keycloak (PRs #1–#3), EPI-006 Jira collector, screenshots and EPI-007 GitLab collector and EPI-008 identity mapping/admin screens (PRs #1–#8).
- **In progress:** `feature/org-admin` from main @ `b6eef16`. Steps: (1) org admin API: groups/teams create/rename/move/deactivate, people create/update/deactivate, effective-dated memberships (add/transfer/end), role assignments (add/end; role↔scope validation; no self-assignment; keep ≥1 admin), grades — all audited, RBAC + validation integration tests; (2) ✅ admin UI tabs Organization + People with web tests (committed); (3) E2E + screenshots, docs, CI, PR, merge. `git log` shows which steps are done.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; admin: `bash scripts/e2e-admin.sh`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
