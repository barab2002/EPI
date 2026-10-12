# Readiness report (Phase 0)

**Verdict: GO-WITH-GAPS** for synthetic/demo development. **NO-GO** for real-data pilot until Jira/GitLab/Keycloak/privacy items in `ACCESS_REQUIREMENTS.md` (B*, C*) are provided.

## Environment inventory (verified 2026-10-12, cloud dev container)

| Item | Status | Evidence |
|---|---|---|
| OS | ✅ Ubuntu 24.04.5, x86_64, 4 vCPU, 15 GB RAM | `uname`, `free` |
| Git + remote | ✅ git 2.43; `origin = github.com/barab2002/EPI` | `git remote -v` |
| Node / pnpm | ✅ Node 22.22.0, pnpm 10.28.0, npm 10.9.4 | `--version` |
| npm registry | ✅ reachable via proxy (dev only; production uses offline bundle) | HTTP 200 |
| Docker Engine + Compose | ✅ 29.8.2 / Compose v5.6.0 — daemon had to be started manually (`dockerd`) | `docker info` |
| Docker Hub | ⚠️ HTTP 429 (rate limited); `mirror.gcr.io` works | ADR-009 |
| PostgreSQL | ✅ client + server binaries 16.15 and `postgres:16-alpine` image | `psql --version` |
| Python | ✅ 3.13 (not used by the app, ADR-001) | |
| Playwright Chromium | ✅ pre-installed at `/opt/pw-browsers` | env |
| gitleaks / trivy / syft | ❌ missing — secret scan uses a built-in grep fallback (`scripts/secret-scan.sh`) until approved tools are installed | `command -v` |
| helm / kubectl | ❌ missing (Phase 2, optional) | |
| Jira DC / GitLab / Keycloak | ❌ no access in this environment | — |
| MCP servers | GitHub MCP (repo ops) available; **no Jira/GitLab MCP** | session tools |
| GitLab CI runner | ❌ none; local `scripts/ci.sh` is the equivalent | ADR-006 |

## Skills / capabilities

Available and used: Git/GitHub workflow, NestJS/TypeScript, React/Vite, PostgreSQL, Docker Compose, Jest/Vitest/Playwright, technical writing. Not available as installed skills (normal engineering practice instead): Keycloak administration, Jira/GitLab MCP, Helm, SBOM/vuln scanning tools.

## Recommended defaults applied until told otherwise

Synthetic data only · English UI with localization files · minimum aggregate size 5 · KPI minimum sample 10 (5–9 low confidence) · trend threshold ±8% · REST (not MCP) for Jira/GitLab · scheduler not enabled.
