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
| 2026-10-13 11:55 | web unit · lint/typecheck · admin e2e · layout guard · captures before/after (all admin tabs, 4 widths) | ✅ 34/34 · clean · 2/2 · ❌ sign-in 366 px at 320 with SSO configured (UX-051) → fixed → ✅ · reviewed (inputs stretched vertically in stacked fields found and fixed in round 2) |
| 2026-10-13 13:30 | web unit (+3: formatMonth, useMutation re-entry, local today) also under `TZ=America/Los_Angeles` · contrast check · demo e2e incl. layout guard · admin e2e (screenshots) · doc screenshots ×2 (idempotent) | ✅ 37/37 · 38/38 pairs (after UX-056) · 6 passed · 2/2 · 2/2 runs |

## Contrast (WCAG 2.2 AA, from `node scripts/check-contrast.mjs --markdown`)

| Pair | Theme | Ratio | Minimum | Result |
|---|---|---|---|---|
| Body text on surface | light | 17.96:1 | 4.5:1 | pass |
| Body text on canvas | light | 16.46:1 | 4.5:1 | pass |
| Secondary text on surface | light | 6.25:1 | 4.5:1 | pass |
| Secondary text on canvas | light | 5.73:1 | 4.5:1 | pass |
| Secondary text on sidebar | light | 5.98:1 | 4.5:1 | pass |
| Secondary text on sunken | light | 5.47:1 | 4.5:1 | pass |
| Captions on surface | light | 4.58:1 | 4.5:1 | pass |
| Links on surface | light | 5.57:1 | 4.5:1 | pass |
| Navigation on sidebar | light | 5.33:1 | 4.5:1 | pass |
| Selected navigation | light | 4.89:1 | 4.5:1 | pass |
| Primary button label | light | 5.57:1 | 4.5:1 | pass |
| Positive on surface | light | 6.65:1 | 4.5:1 | pass |
| Success message | light | 5.79:1 | 4.5:1 | pass |
| Caution on surface | light | 5.93:1 | 4.5:1 | pass |
| Critical on surface | light | 5.89:1 | 4.5:1 | pass |
| Error message / danger hover | light | 5.11:1 | 4.5:1 | pass |
| Notice text | light | 8.55:1 | 4.5:1 | pass |
| Input edge on surface | light | 3.39:1 | 3:1 | pass |
| Input edge on canvas | light | 3.32:1 | 3:1 | pass |
| Body text on surface | dark | 15.99:1 | 4.5:1 | pass |
| Body text on canvas | dark | 17.27:1 | 4.5:1 | pass |
| Secondary text on surface | dark | 7.51:1 | 4.5:1 | pass |
| Secondary text on canvas | dark | 8.11:1 | 4.5:1 | pass |
| Secondary text on sidebar | dark | 7.80:1 | 4.5:1 | pass |
| Secondary text on sunken | dark | 6.88:1 | 4.5:1 | pass |
| Captions on surface | dark | 5.60:1 | 4.5:1 | pass |
| Links on surface | dark | 6.30:1 | 4.5:1 | pass |
| Navigation on sidebar | dark | 6.54:1 | 4.5:1 | pass |
| Selected navigation | dark | 4.94:1 | 4.5:1 | pass |
| Primary button label | dark | 6.76:1 | 4.5:1 | pass |
| Positive on surface | dark | 8.98:1 | 4.5:1 | pass |
| Success message | dark | 6.89:1 | 4.5:1 | pass |
| Caution on surface | dark | 10.69:1 | 4.5:1 | pass |
| Critical on surface | dark | 7.41:1 | 4.5:1 | pass |
| Error message / danger hover | dark | 5.90:1 | 4.5:1 | pass |
| Notice text | dark | 10.86:1 | 4.5:1 | pass |
| Input edge on surface | dark | 3.34:1 | 3:1 | pass |
| Input edge on canvas | dark | 3.31:1 | 3:1 | pass |
