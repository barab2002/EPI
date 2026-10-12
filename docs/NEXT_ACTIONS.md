# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (see `JIRA.md` §1) to run `jira-check` and reconcile 20 real issues; Keycloak realm C1.
2. **EPI-007 GitLab adapter (mock first)** on `feature/gitlab-collector` from `main`: reuse `ingestion/http.ts`, fake GitLab server like `test/fake-jira.ts`; MRs, discussions, reviewer-request events, bot exclusion, issue-key linking with confidence.
3. **EPI-008** identity mapping + data-quality page; **admin CRUD** for hierarchy/roles with audit.
4. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).

- **UI nit:** on narrow screens the top navigation wraps “My view” (add `white-space: nowrap` / horizontal scroll to `.nav a`), then refresh `docs/SCREENSHOTS.md` mobile shots.
