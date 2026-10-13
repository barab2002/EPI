# Next actions (ordered)

1. **Owner (when available):** Jira details B1–B3 (`JIRA.md` §1) and GitLab details B4–B6 (`GITLAB.md` §1) to run `jira-check`/`gitlab-check` and reconcile 20 issues + 10 MRs; Keycloak realm C1.
2. **EPI-012a** on `feature/offline-bundle` from `main`: pin base/runtime images by digest (resolved via the mirror, recorded in `deploy/images.lock`), `./epi.sh bundle` (docker save of pinned images + compose files + `epi.sh` + checksums into one tarball) and `./epi.sh offline-install <bundle>` (verify checksums, docker load, start, health check); test with a Docker network that has no egress (`--internal`). Dependency license inventory from `pnpm licenses list --json` (no new tools).
3. **EPI-012b** SBOM + vulnerability scan — needs an approved tool (e.g. Syft/Trivy, offline DB); request in ACCESS_REQUIREMENTS.

