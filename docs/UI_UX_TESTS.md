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
