# Backlog & implementation plan

Estimates are rough developer-days (spec §13). Pilot kickoff subset (target 2026-11-02): **EPI-001, 002, 004 (core), 005, 009 (Cycle Time + Aging + Review Waiting on synthetic data), 010 (team/developer views), 011, demo install** — Keycloak (003) and live Jira (006) if access arrives by ~2026-10-22.

Dependency graph: `001 → 002 → {003, 006, 007}`; `003 → {004, 005}`; `{006,007} → 008 → 009`; `{004,005,009} → 010`; `{004,005} → 011`; all P0 → 012.

| ID | P | Deliverable | Est | Status | Acceptance criteria |
|---|---|---|---:|---|---|
| EPI-001 | P0 | Repo, ADRs, docs, CI checks | 0.5 | Done (local CI) | Docs present; `scripts/ci.sh` runs lint, typecheck, tests, build, secret scan; Conventional Commits; branch pushed. |
| EPI-002 | P0 | Compose, config, doctor, demo seed | 1.5 | Done (demo); install/offline pending | `./epi.sh demo` starts postgres + epi, runs migrations, seeds labeled synthetic data, `/health/ready` OK; `./epi.sh doctor` prints PASS/WARN/FAIL. |
| EPI-009a | P0 | KPI engine (pure): Cycle Time, Work Item Aging, Review Waiting (+ proxy), confidence, trend | 1.0 | Done | Unit tests cover spec examples, empty samples, negative intervals, reopened items, zero baseline, bot/self comments, multiple reviewers, time zones. |
| EPI-004 | P0 | Org tree, memberships, RBAC scopes, audit | 2.5 | Done (incl. admin CRUD, EPI-004b) | Effective-dated memberships/assignments; negative tests: dev↛peer, TL↛other team, GM↛other group, admin↛private review, IDOR, small-group suppression. |
| EPI-005 | P0 | Unified UI shell, navigation, design tokens | 1.5 | Done | Left nav, breadcrumb Org/Group/Team/Person, loading/empty/error/denied states, keyboard accessible, responsive. |
| EPI-010 | P0 | Org/group/team/person dashboards + KPI drawer | 2.5 | Done on synthetic data | KPI cards show value, unit, sample, freshness, confidence, delta; "How calculated?" drawer; synthetic data labeled. |
| EPI-011 | P0 | Monthly manager assessment | 1.5 | Done | Independence/Growth 1–5 + evidence required; only for scoped members; audited. |
| EPI-003 | P0 | Keycloak OIDC login/session + tests | 1.5 | Done (tested with ephemeral Keycloak); real realm needs C1 | Code+PKCE BFF, state/nonce, secure cookie, CSRF, logout; tests with local Keycloak container. |
| EPI-006 | P0 | Jira collector + mapping | 2.5 | Done against fake Jira DC; real reconciliation needs B1–B3 | Pagination, cursor, 48h overlap, idempotent upserts, retries; failed sync doesn't advance cursor. |
| EPI-007 | P0 | GitLab collector + MR/review mapping | 2.0 | Done against fake GitLab; real reconciliation needs B4–B6 | Same as 006; bots/self comments excluded; MR↔issue regex links with confidence. |
| EPI-008 | P0 | Identity mapping + data-quality view | 1.0 | Done (API + admin UI, tested with fake sources) | Coverage %, unmapped identities listed; manual mapping audited. |
| EPI-012 | P0 | Offline bundle, install tests, security/UAT | 3.0 | Planned | `bundle` + egress-blocked install; backup/restore tested; SBOM; pinned digests. |
| EPI-013..016 | P1 | Competencies, self-review, dev plans, more KPIs, calibration | 12 | Phase 2 | Per spec §3 Phase 2. |
| OPS-01 | P2 | Hourly resume scheduler scripts (`--dry-run`, **not enabled**) | 0.5 | Done (not enabled) | Lock, skip-when-active, bounded retries, logs; enablement requires approval C10. |
