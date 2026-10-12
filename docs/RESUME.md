# Resume point

status: active — next unblocked task is EPI-006 (Jira adapter, mock first)

- **main** @ `56205d2` = Phase 0 + vertical slice 1 (PR #1, merged 2026-10-12 with owner approval).
- **feature/keycloak-oidc** = EPI-003 complete and pushed; **not merged** (awaiting owner approval to merge).
- **Next exact action:** `git fetch origin && git checkout -b feature/jira-collector origin/feature/keycloak-oidc` (stack on EPI-003 until it merges), then implement EPI-006 per `NEXT_ACTIONS.md` item 2, test-first with recorded Jira DC REST fixtures (no real Jira access).
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh` (needs Docker: start `dockerd &` if the daemon is down). UI flows: `./epi.sh demo && pnpm run e2e`; SSO browser flow: `bash scripts/e2e-oidc.sh`.
- **Scheduler:** Routine `trig_01KXpTGZKMatHx36donkyqXL` wakes this session hourly at :32 (ADR-014). It must not merge, open PRs or touch real systems without approval.
- **Environment notes:** Docker Hub is rate-limited here → `EPI_IMAGE_REGISTRY=mirror.gcr.io`; Keycloak image `quay.io/keycloak/keycloak:26.3.3` pulls fine; Playwright browsers in `/opt/pw-browsers`.
