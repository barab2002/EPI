# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **EPI-012c `upgrade`** on `feature/upgrade` from `main`: `./epi.sh upgrade <bundle.tar>` for an offline installation — verify bundle, automatic `backup` first, load new images, switch `deploy/offline.env` atomically (keep previous for rollback), start, wait healthy (migrations run in the entrypoint), else roll back images + restore backup; `./epi.sh rollback`. Test: install bundle N, add data, upgrade to N+1 (dummy version bump), data preserved; forced failure rolls back.
3. **EPI-012b** SBOM + vulnerability scan — waits for C11 (scanner approval).

