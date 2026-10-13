# UI/UX tests

## Strategy

| Layer | What | Command |
|---|---|---|
| Unit (web) | components, states, formatting | `pnpm --filter @epi/web test` (in `scripts/ci.sh`) |
| E2E journeys | sign-in, drill-down, assessment, admin, SSO | `pnpm run e2e`, `scripts/e2e-admin.sh`, `scripts/e2e-oidc.sh`, `scripts/e2e-sso-ldap.sh` |
| Layout guard | no horizontal overflow at 320/390/768/1440/1920 on key routes | `e2e/layout.spec.ts` (Slice 1) |
| Review captures | 10 screens × 390/768/1440/1920 for human/AI inspection | `EPI_UX_CAPTURE=<dir> npx playwright test e2e/ux-capture.spec.ts --project=desktop` |
| Accessibility | keyboard paths, focus, labels, contrast table; automated axe would need a new dependency (axe-core, MPL-2.0) → not added without approval | manual + e2e keyboard tests |

## Results

| When (UTC) | Run | Result |
|---|---|---|
| 2026-10-13 05:20 | baseline `ux-capture` (demo, pre-redesign) | 40 captures; findings UX-001…015 |
| 2026-10-13 05:25 | overflow probe at 390 px | `scrollWidth` 424 on `/`, `/kpis`, `/reviews` → UX-001 |
| 2026-10-13 06:05 | `e2e/layout.spec.ts` (before slice 1) | ❌ as expected: `/` 424 px at 320 px |
| 2026-10-13 06:30 | layout guard after slice 1 | ❌ `/admin/audit` 461 px at 320 → unwrapped tables (UX-016) fixed; ❌ `/admin/people` 350 px → field groups (UX-018) fixed; then ✅ |
| 2026-10-13 06:40 | web unit · demo e2e · admin e2e ×2 · 40 captures | ✅ 33/33 · 6 passed, 20 skipped by design · 2/2 ×2 · reviewed |
| 2026-10-13 07:30 | Impeccable critique: sub-agent A (design) + B (browser probes: headings, names, contrast, targets, keyboard, copy) | 27/40; 14 findings → UX-019…032 |
| 2026-10-13 08:05 | web unit · demo e2e (incl. layout guard) · admin e2e · 44 captures (incl. group page) | ✅ 33/33 · 6 passed, 20 skipped by design · 2/2 · reviewed (2 rounds) |
| 2026-10-13 10:05 | `reviews-due.int.spec.ts` (new) + RBAC suite, serial | ✅ 28/28 (a parallel run without `--runInBand` showed 5 false failures from shared test DB) |
| 2026-10-13 10:20 | web unit · demo e2e (+ home assertion) · admin e2e · captures ×2 rounds | ✅ 33/33 · 6 passed · 2/2 · reviewed |
| 2026-10-13 10:55 | web unit (2 new form tests: errors+focus, draft prefill) · demo e2e ×2 (incl. re-run path) · pilot flow on a **fresh** throwaway database (port 8095, removed after) · admin e2e · captures | ✅ 34/34 · 6 passed · 3/3 fresh · 2/2 · reviewed. First demo run failed only because Docker was down after an idle container restart |
