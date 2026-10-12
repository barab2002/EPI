# Implementation log

- **2026-10-12** — Phase 0: environment discovery, readiness (GO-WITH-GAPS), consolidated access request, architecture, ADR-001..009 (NestJS backend per owner preference), backlog, risks. Workspace + CI scripts.
- **2026-10-12** — KPI engine test-first (Cycle Time, Aging, Review Waiting + proxy, confidence, trends).
- **2026-10-12** — Schema migration, synthetic seed (26 users, 4 teams, transfer, small team), sessions + CSRF, ScopeService RBAC, org/KPI/review APIs, Swagger. Integration tests found and fixed a real bug: TypeORM returns `[rows, count]` for `UPDATE … RETURNING`, which made session lookup accept unknown tokens with an empty user; fixed via `db/rows.ts` + regression tests.
- **2026-10-12** — Unified React UI, Playwright e2e (desktop + mobile), Docker image + Compose + `epi.sh`, backup/restore verified, scheduler scripts (disabled).
