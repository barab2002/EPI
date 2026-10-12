#!/usr/bin/env bash
# Browser E2E for administration: ephemeral PostgreSQL + fake Jira/GitLab (synthetic data) + EPI
# (built dist, demo mode), connections configured via the CLI, then Playwright e2e/admin.spec.ts.
# Requires `pnpm -r run build`. Pass --screenshots to also refresh docs/screenshots/2x-admin-*.png.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "${1:-}" != "--inner" ]; then
  export EPI_E2E_SCREENSHOTS="${1:-}"
  exec bash "$ROOT/scripts/test-db.sh" run -- bash "$ROOT/scripts/e2e-admin.sh" --inner
fi
work=$(mktemp -d); chmod 700 "$work"
fake_cred="t$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
(umask 077; printf "%s" "$fake_cred" >"$work/token")
node --no-warnings --experimental-transform-types "$ROOT/scripts/dev/fake-sources.mts" "$fake_cred" >"$work/fakes.json" &
fakes=$!
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
api=""
trap 'kill $fakes ${api} 2>/dev/null || true; rm -rf "$work"' EXIT
for _ in $(seq 1 30); do [ -s "$work/fakes.json" ] && break; sleep 0.5; done
url() { python3 -c "import json; print(json.load(open('$work/fakes.json'))['$1'])"; }
export DATABASE_URL="$EPI_TEST_DATABASE_URL" EPI_MODE=demo PORT="$port" EPI_PUBLIC_URL="http://127.0.0.1:$port" \
  EPI_WEB_DIST="$ROOT/apps/web/dist" EPI_JIRA_TOKEN_FILE="$work/token" EPI_GITLAB_TOKEN_FILE="$work/token"
cd "$ROOT/apps/api"
psql "$DATABASE_URL" -qc 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
node dist/cli.js migrate >/dev/null && node dist/cli.js seed-demo >/dev/null
node dist/cli.js jira-add --name jira-pilot --url "$(url jira)" --projects PAY --allow-http >/dev/null
node dist/cli.js gitlab-add --name gitlab-pilot --url "$(url gitlab)" --projects 12 --allow-http >/dev/null
node dist/main.js >"$work/api.log" 2>&1 &
api=$!
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$port/health/ready" >/dev/null 2>&1 && break; sleep 1; done
cd "$ROOT"
EPI_E2E_URL="http://127.0.0.1:$port" EPI_E2E_ADMIN=1 \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
  npx playwright test e2e/admin.spec.ts --project=desktop
