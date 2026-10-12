#!/usr/bin/env bash
# Browser E2E for SSO: ephemeral PostgreSQL + Keycloak + EPI (built dist) with OIDC enabled,
# then Playwright e2e/oidc.spec.ts. Everything is torn down afterwards. Requires `pnpm build`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "${1:-}" != "--inner" ]; then
  exec bash "$ROOT/scripts/test-db.sh" run -- bash "$ROOT/scripts/test-keycloak.sh" run -- \
    bash "$ROOT/scripts/e2e-oidc.sh" --inner
fi
work=$(mktemp -d); chmod 700 "$work"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
public="http://127.0.0.1:$port"
node "$ROOT/scripts/kc-provision-test-realm.mjs" "$public" >"$work/realm.json"
json() { python3 -c "import json,sys; print(json.load(open('$work/realm.json'))['$1'])"; }
(umask 077; json clientSecret >"$work/client_secret")
export DATABASE_URL="$EPI_TEST_DATABASE_URL" EPI_MODE=demo PORT="$port" EPI_PUBLIC_URL="$public" \
  EPI_WEB_DIST="$ROOT/apps/web/dist" EPI_OIDC_ISSUER="$(json issuer)" EPI_OIDC_CLIENT_ID=epi-web \
  EPI_OIDC_CLIENT_SECRET_FILE="$work/client_secret" EPI_OIDC_ALLOW_HTTP=true
cd "$ROOT/apps/api"
psql "$DATABASE_URL" -qc 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
node dist/cli.js migrate >/dev/null && node dist/cli.js seed-demo >/dev/null
psql "$DATABASE_URL" -qc "UPDATE users SET keycloak_sub = '$(json userId)' WHERE display_name = 'Taylor Lead'"
node dist/main.js >"$work/api.log" 2>&1 &
api=$!
trap 'kill $api 2>/dev/null || true; rm -rf "$work"' EXIT
for _ in $(seq 1 30); do curl -fsS "$public/health/ready" >/dev/null 2>&1 && break; sleep 1; done
cd "$ROOT"
EPI_E2E_URL="$public" EPI_E2E_OIDC_USER="$(json username)" EPI_E2E_OIDC_PASSWORD="$(json password)" \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
  npx playwright test e2e/oidc.spec.ts --project=desktop
