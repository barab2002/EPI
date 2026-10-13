#!/usr/bin/env bash
# Single source of truth for CI checks (local and GitLab CI). Usage: scripts/ci.sh [--no-integration]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
step() { printf '\n==> %s\n' "$*"; }

step "install (frozen lockfile)"
pnpm install --frozen-lockfile --prefer-offline
step "secret scan";        bash scripts/secret-scan.sh
step "pinned images";      bash scripts/check-pins.sh
step "format check";       pnpm run format:check
step "lint";               pnpm run lint
step "typecheck";          pnpm run typecheck
step "unit tests";         pnpm --filter @epi/api run test:unit
if [ -d apps/web ] && [ -f apps/web/package.json ]; then
  step "web tests";        pnpm --filter @epi/web run test
fi
if [ "${1:-}" != "--no-integration" ]; then
  step "integration tests (PostgreSQL + Keycloak)"
  EPI_REQUIRE_KEYCLOAK=1 bash scripts/test-db.sh run -- bash scripts/test-keycloak.sh run -- \
    pnpm --filter @epi/api run test:int
fi
step "build";              pnpm run build
echo; echo "CI: ALL CHECKS PASSED"
