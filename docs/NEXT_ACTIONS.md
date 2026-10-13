# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **Scheduled sync** on `feature/scheduled-sync` from `main`: in-process daily sync job (`sync.daily_hour_local`, default 02:00) with the same one-run guard; admin toggle; tests with a fake clock.
3. **Audit-log viewer** (admin, read-only, filter by action/actor/date; no review text).
4. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).

