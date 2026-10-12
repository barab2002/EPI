# EPI — Engineering Performance & Improvement

One self-hosted web application for engineering managers and developers: organization hierarchy, explainable flow KPIs (from Jira/GitLab), monthly manager assessments, with strict scoped access. Built for closed networks: no cloud services, no runtime internet, no external fonts or CDNs.

> **Status (2026-10-12): pilot vertical slice + Keycloak single sign-on.** Synthetic data only. Real Jira/GitLab ingestion and the offline bundle are not implemented yet; see [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md). SSO setup: [`docs/KEYCLOAK.md`](docs/KEYCLOAK.md).

## Quick start (demo, synthetic data)

Prerequisites: Docker Engine 24+ with Compose v2, Node 22 + pnpm 10 (to build), ~5 GB disk.

```bash
./epi.sh doctor          # checks prerequisites
./epi.sh demo            # builds, starts Postgres + EPI, seeds synthetic data
# open http://127.0.0.1:8080 — choose a demo person, or "Sign in with your organization account"
# with one of the printed demo Keycloak users (./epi.sh credentials shows them again)
```

If Docker Hub rate-limits you, use a mirror: `EPI_IMAGE_REGISTRY=mirror.gcr.io ./epi.sh demo` (or your internal registry).

Other commands: `start`, `stop`, `status`, `logs`, `test`, `backup`, `restore <file>`. Run `./epi.sh help`.

## Screenshots

A tour of every screen (sign-in, role-based homes, drill-down, KPI explanations, assessments, privacy suppression, mobile, dark mode, API docs): **[docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)**.

![Team overview](docs/screenshots/07-team-overview.png)

## What to try in the demo

| Sign in as | Role | Sees |
|---|---|---|
| Morgan Example | Engineering manager | Whole org, all KPIs |
| Gal Groupman | Group manager (Platform) | Platform teams and people, not Product |
| Taylor Lead | Team lead (Payments) | Payments members, their KPIs; can write assessments |
| Eli Engineer | Developer | Own profile/KPIs, Payments as an aggregate only |
| Jo Small | Developer in a 3-person team | Team aggregate **suppressed** (privacy minimum 5) |
| Avery Admin | Administrator | Structure only; no KPIs or private reviews |

Every KPI card has **How calculated?** with the formula, population, exclusions, minimum sample, limitations and a worked example computed by the same engine.

## Development

```bash
pnpm install
pnpm --filter @epi/api run test:unit        # KPI engine, config
bash scripts/test-db.sh run -- pnpm --filter @epi/api run test:int   # needs Docker
pnpm --filter @epi/web run test
bash scripts/ci.sh                          # everything CI runs
pnpm run e2e                                # Playwright against a running demo
```

Layout: `apps/api` (NestJS 11, TypeORM migrations, PostgreSQL 16), `apps/web` (React 19 + Vite), `deploy/` (Dockerfile, Compose), `e2e/` (Playwright), `scripts/` (CI, test DB, secret scan, scheduler), `docs/` (architecture, decisions, state).

Working rules: [`CLAUDE.md`](CLAUDE.md). Product spec: [`EPI_Lite_Claude_Master_Spec.md`](EPI_Lite_Claude_Master_Spec.md).
