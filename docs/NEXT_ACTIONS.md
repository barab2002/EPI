# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **Audit-log viewer** on a new `feature/audit-log` branch from `main` (admin, read-only, filter by action/actor/date, paginated; no review text or personal values); API integration tests (admin-only, filters, no leakage) + web tests + e2e step + screenshot.
3. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).

