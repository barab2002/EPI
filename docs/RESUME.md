# Resume point

status: active — waiting on owner decisions (A1–A5) but unblocked work remains (next: EPI-003)

- **Branches:** `chore/phase-0-foundation` (docs/tooling/KPI engine, pushed) → `feature/vertical-slice-1` (built on it; API, UI, deploy, e2e, scheduler; pushed). `main` untouched. No PR/MR opened.
- **Last completed:** vertical slice 1 in demo mode + checkpoint docs.
- **Environment notes (cloud dev container):** Docker daemon may need `dockerd &` first; Docker Hub is rate-limited → `export EPI_IMAGE_REGISTRY=mirror.gcr.io`. Playwright uses `/opt/pw-browsers`.
- **Next exact action:** `git checkout feature/vertical-slice-1 && git checkout -b feature/keycloak-oidc`, then implement EPI-003 per `NEXT_ACTIONS.md` item 2.
- **Validate before commit:** `EPI_IMAGE_REGISTRY=mirror.gcr.io bash scripts/ci.sh`; for UI flows `./epi.sh demo && pnpm run e2e`.
