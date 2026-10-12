# Resume point

status: active — next unblocked task is EPI-008 (identity mapping + admin/data-quality UI)

- **main** contains: Phase 0, vertical slice 1, EPI-003 Keycloak SSO, demo Keycloak (PRs #1–#3), EPI-006 Jira collector, screenshots and EPI-007 GitLab collector (PRs #1–#7).
- **Next exact action:** `git fetch origin && git checkout -b feature/identity-mapping origin/main`; implement EPI-008 per `NEXT_ACTIONS.md` item 2 (API first with RBAC tests, then admin screens, then data-quality page), test-first.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
