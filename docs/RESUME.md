# Resume point

status: active — EPI-007 (GitLab collector) IN PROGRESS on `feature/gitlab-collector`

- **main** contains: Phase 0, vertical slice 1, EPI-003 Keycloak SSO, demo Keycloak (PRs #1–#3), and EPI-006 Jira collector (PRs #1–#4).
- **In progress:** branch `feature/gitlab-collector` (from main @ `7c4c5d2`). Steps: (1) shared sync-run helpers + HTTP headers for paging, (2) GitLab mapper unit tests (review-request system notes, bots, Jira key linking), (3) client + sync + fake GitLab integration tests, (4) CLI/admin dispatch, (5) docs/GITLAB.md, CI, PR, merge. Check `git log` on the branch to see which steps are committed.
- **Original plan:** implement EPI-007 per `NEXT_ACTIONS.md` item 2: GitLab REST client (projects, merge requests with `updated_after`, discussions/notes, reviewer-request system notes or `reviewers`), bot exclusion, MR↔Jira key linking with confidence, idempotent upserts into `merge_requests`/`review_events`, fake GitLab server tests.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). UI: `./epi.sh demo && pnpm run e2e`; SSO E2E with demo users: see TEST_STATUS.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3`; Playwright browsers in `/opt/pw-browsers`.
