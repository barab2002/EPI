# Resume point

status: active — EPI-012c `upgrade` IN PROGRESS on `feature/upgrade` (from main @ `5d40270`)

- **main** contains PRs #1–#12 (… scheduled daily sync, audit-log viewer, EPI-012a offline bundle @ `5d40270`).
- **Next task:** EPI-012c on `feature/upgrade` from `main` — see `NEXT_ACTIONS.md` #2 (offline `upgrade` with automatic backup and rollback). Start from `epi.sh` `cmd_offline_install` and `scripts/test-offline-install.sh` (extend into an upgrade test: bundle N → data → bundle N+1).
- **Waiting on the owner:** B1–B6 (Jira/GitLab), C1 (Keycloak), C8 (retention), C11 (SBOM/CVE scanner approval).
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). Offline: `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/test-offline-install.sh`. UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; images pinned in `deploy/images.lock`; Playwright browsers in `/opt/pw-browsers`.
