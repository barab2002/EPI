# Resume point

status: active — owner decisions recorded (ADR-024); next: EPI-003b production Keycloak + AD/LDAPS

- **main** contains PRs #1–#12 (… scheduled daily sync, audit-log viewer, EPI-012a offline bundle); PR #13 `docs/pilot-decisions` records the owner's answers.
- **Next task:** EPI-003b on `feature/prod-keycloak` from `main` — `NEXT_ACTIONS.md` #1. First check licenses/images: Keycloak 26.3.3 (pinned), an OpenLDAP test image (synthetic AD-like users/groups, test-only) — pin by digest. (`feature/upgrade` exists with only a docs checkpoint; EPI-012c is now #3.)
- **Owner decisions 2026-10-13 (ADR-024):** internal-only Jira DC + GitLab; EPI on an internal Docker server via a copied bundle; AD/LDAPS sign-in through a bundled Keycloak; teams from AD groups, roles in EPI; 24-month retention; EN + HE; pilot 2026-11-02. Plan: `NEXT_ACTIONS.md`. Still with HR: B7 sign-off, C7 privacy minimum.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). Offline: `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/test-offline-install.sh`. UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; images pinned in `deploy/images.lock`; Playwright browsers in `/opt/pw-browsers`.
