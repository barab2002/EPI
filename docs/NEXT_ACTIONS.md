# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **EPI-008** on `feature/identity-mapping` from `main`: admin UI + API for external identities (Jira/GitLab → EPI users, list unmapped IDs seen in syncs), integrations/sync-run/status-mapping screens, data-quality page (mapping coverage, unknown statuses, skipped issues, stale data); then admin CRUD for hierarchy/roles with audit.
3. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).

- **UI nit:** on narrow screens the top navigation wraps “My view” (add `white-space: nowrap` / horizontal scroll to `.nav a`), then refresh `docs/SCREENSHOTS.md` mobile shots.
