# EPI — Engineering Performance & Improvement

One self-hosted web application for engineering managers and developers: organization hierarchy, explainable flow KPIs (from Jira/GitLab), monthly manager assessments, with strict scoped access. Built for closed networks: no cloud services, no runtime internet, no external fonts or CDNs.

> **Status (2026-10-13): pilot feature set on synthetic data** — Keycloak SSO, Jira/GitLab collectors (tested against fakes), identity mapping, organization admin, daily sync, audit log, offline bundle. Not yet connected to real Jira/GitLab/Keycloak; see [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md). Guides: [SSO](docs/KEYCLOAK.md) · [Jira](docs/JIRA.md) · [GitLab](docs/GITLAB.md) · [Offline install](docs/OFFLINE_INSTALL.md).

## Run the real app on your computer (one command)

Prerequisites: Docker (Docker Desktop on macOS/Windows; on Windows run it from WSL2) and this
repository. Node and pnpm are optional: without them the app is built inside Docker.

```bash
./epi.sh up
```

The first time it asks for your name, work e-mail and organization name, then:

- builds EPI (only when the code changed since the last build) and starts it in **production
  mode with an empty database**: no demo people, no demo sign-in;
- sets up sign-in on this computer and makes you the administrator; it prints a one-time password
  (`./epi.sh credentials` shows it again) and asks you to choose your own at first sign-in;
- opens nothing to the network: EPI is at http://127.0.0.1:8080, reachable from this computer only.

Then, in Administration: Organization (groups, teams) → People → Settings (Jira, GitLab; tokens
with `./epi.sh source-token`). `./epi.sh stop` stops it; `./epi.sh up` starts it again with your
data. With `.epi/sso.conf` present (see [docs/KEYCLOAK.md](docs/KEYCLOAK.md)), `up` signs people in
with Active Directory instead. Behind a company proxy that inspects HTTPS, set `EPI_BUILD_CA_FILE`
to its CA certificate (and `EPI_BUILD_NETWORK=host` if the proxy runs on your computer).

## Quick start (demo, synthetic data)

Prerequisites: Docker Engine 24+ with Compose v2, ~5 GB disk (Node 22 + pnpm 10 optional). The demo keeps its data apart from the real app (separate database volumes).

```bash
./epi.sh doctor          # checks prerequisites
./epi.sh demo            # builds, starts Postgres + EPI, seeds synthetic data
# open http://127.0.0.1:8080 — choose a demo person, or "Sign in with your organization account"
# with one of the printed demo Keycloak users (./epi.sh credentials shows them again)
```

If Docker Hub rate-limits you, use a mirror: `EPI_IMAGE_REGISTRY=mirror.gcr.io ./epi.sh demo` (or your internal registry).

Other commands: `start`, `stop`, `status`, `logs`, `test`, `backup`, `restore <file>`, `bundle`, `offline-install <bundle>`. Run `./epi.sh help`.

**Air-gapped hosts:** `./epi.sh bundle` on a connected machine, then `./epi.sh offline-install <bundle.tar>` on the target — no registry or internet needed ([docs/OFFLINE_INSTALL.md](docs/OFFLINE_INSTALL.md)).

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
| Jo Small | Developer in a 3-person team | Sees team totals (privacy minimum 3 people; smaller groups are hidden) |
| Avery Admin | Administrator | Structure, integrations, identity mapping, data quality; no KPIs or private reviews |

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
