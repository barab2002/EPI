# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **EPI-004b admin CRUD** on `feature/org-admin` from `main`: API + screens to create/rename groups and teams, manage effective-dated team memberships (incl. transfers), role assignments and grades; every mutation audited; RBAC negative tests; keeps history (no hard deletes).
3. **Scheduled sync:** in-process daily sync job (`sync.daily_hour_local`, default 02:00) with the same one-run guard; admin toggle; tests with a fake clock.
4. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).

