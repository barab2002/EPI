# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Full P0 (~21.5 dev-days) not achievable by 2026-11-02 | High | High | Pilot kickoff with agreed subset (login/RBAC, hierarchy, Cycle Time, one dashboard, KPI explanation, install path); remaining P0 iteratively. |
| R2 | Real Jira/GitLab/Keycloak access arrives late | High | High | Mock adapters + synthetic data behind the same adapter contract; Jira-only live fallback. |
| R3 | Stack deviation from spec (NestJS vs FastAPI) rejected later | Low | Medium | ADR-001 recorded; decision requested now while cost of change is small. |
| R4 | KPI misuse for ranking individuals | Medium | High | No leaderboards; confidence/N/A; caveats in every drawer; reviewer KPIs framed as team process. |
| R5 | Cross-team data leakage | Medium | High | SQL-level scope filters; negative RBAC/IDOR tests in CI; suppression of small aggregates incl. exports. |
| R6 | GitLab lacks reviewer-request events → Review Waiting Time unmeasurable | Medium | Medium | Separate, labeled proxy KPI `MR_OPEN_TO_FIRST_REVIEW`. |
| R7 | Offline install misses a dependency | Low (was Medium) | High | Pinned lockfile + image digests (`deploy/images.lock`); `scripts/test-offline-install.sh` installs from a bundle and runs on a no-egress network. Residual: test runs on the build host — repeat on a clean VM before the pilot. |
| R8 | Docker Hub rate limits in build environments | Medium | Low | Configurable `EPI_IMAGE_REGISTRY` / internal mirror (ADR-009). |
| R9 | Secret scanning tools (gitleaks/trivy/syft) not installed | Medium | Medium | Grep-based fallback now; request approval to add pinned tools. |
| R10 | Dev container is ephemeral; unpushed work lost | Medium | Medium | Push every verified commit; checkpoint docs. |
