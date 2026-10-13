# Resume point

status: active — UX-01 UI/UX pass: slices 1–2 merged (PRs #17, #18); slice 3 (home + sign-in, UX-013) next on `feature/ui-pass-3`; EPI-004c parked at step 2 on `feature/ad-team-import`

- **main** contains PRs #1–#12 (… scheduled daily sync, audit-log viewer, EPI-012a offline bundle); PR #13 `docs/pilot-decisions` records the owner's answers.
- **Next task:** EPI-004c on `feature/ad-team-import` from `main` — `NEXT_ACTIONS.md` #2. Keycloak already syncs the team groups (group-ldap-mapper, READ_ONLY). Add a confidential service-account client `epi-import` (realm-management `view-users` only) to `kc-prod-realm.mjs`; EPI reads groups + members via Keycloak admin REST; admin maps AD group → EPI team; dry-run preview; apply creates/updates people (name, e-mail) and dated memberships, ends memberships of removed members; audited; roles stay manual. Test with the synthetic directory (`scripts/dev/ldap-*.sh`).
- **Owner decisions 2026-10-13 (ADR-024):** internal-only Jira DC + GitLab; EPI on an internal Docker server via a copied bundle; AD/LDAPS sign-in through a bundled Keycloak; teams from AD groups, roles in EPI; 24-month retention; EN + HE; pilot 2026-11-02. Plan: `NEXT_ACTIONS.md`. Still with HR: B7 sign-off, C7 privacy minimum.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (start `dockerd &` if the daemon is down). Offline: `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/test-offline-install.sh`. UI: `./epi.sh demo && pnpm run e2e`; admin: `pnpm -r run build && bash scripts/e2e-admin.sh`.
- **Standing approval:** when a task is complete and CI is fully green, open a PR to `main` and merge it (merge commit).
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014).
- **Environment notes:** Docker Hub rate-limited → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; images pinned in `deploy/images.lock`; Playwright browsers in `/opt/pw-browsers`.
