#!/usr/bin/env bash
# End-to-end test of `./epi.sh up` (the REAL app on one computer, no Active Directory): empty
# state → production mode with local sign-in (Keycloak, own database) → first administrator →
# browser sign-in with the one-time password, which must be changed → Administration. Checks that
# no synthetic data or demo sign-in exists and that a second `up` changes nothing. Temporary state
# directory and Compose project; everything is removed afterwards. Requires Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"; chmod 700 "$work"
project="epi-up-test-$$"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }
export EPI_STATE_DIR="$work/state" COMPOSE_PROJECT_NAME="$project"
export EPI_PORT="$(free_port)" EPI_SSO_PORT="$(free_port)"
# Synthetic test identity (the first administrator); no real person.
export EPI_ADMIN_NAME="Ada Admin" EPI_ADMIN_EMAIL="ada.admin@example.invalid" EPI_ORG_NAME="Test Org"
unset EPI_MODE EPI_RUN_MODE
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p "$project" logs --tail 40 keycloak epi 2>/dev/null | tail -60 >&2 || true
  fi
  docker compose -p "$project" down -v >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT
q() { docker compose -p "$project" exec -T postgres psql -U epi -d epi -tAc "$1"; }

echo "==> ./epi.sh up (first start, no input on stdin)"
out=$(bash "$ROOT/epi.sh" up </dev/null)
echo "$out" | tail -8 | sed 's/^/    /'
echo "$out" | grep -q "EPI is running: http://127.0.0.1:$EPI_PORT" || { echo "FAIL: no running message" >&2; exit 1; }
[ "$(cat "$EPI_STATE_DIR/run-mode")" = real ]
password=$(sed -n 's/^  Password: \([^ ]*\).*/\1/p' "$EPI_STATE_DIR/local/first-sign-in.txt")
[ -n "$password" ] || { echo "FAIL: no first sign-in password" >&2; exit 1; }

echo "==> Real app: production mode, sign-in enabled, no synthetic data, no demo sign-in"
health=$(curl -fsS "http://127.0.0.1:$EPI_PORT/health/ready")
echo "    $health"
echo "$health" | grep -q '"oidc":"ok"' || { echo "FAIL: sign-in not ready" >&2; exit 1; }
[ "$(q 'SELECT count(*) FROM users WHERE is_synthetic')" = 0 ] || { echo "FAIL: synthetic people" >&2; exit 1; }
[ "$(q "SELECT count(*) FROM users")" = 1 ] || { echo "FAIL: expected exactly the administrator" >&2; exit 1; }
[ "$(q "SELECT count(*) FROM role_assignments WHERE role = 'ADMIN'")" = 1 ]
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"userId":"00000000-0000-0000-0000-000000000000"}' "http://127.0.0.1:$EPI_PORT/api/v1/auth/demo-login")
[ "$code" = 404 ] || { echo "FAIL: demo sign-in answered $code" >&2; exit 1; }
docker compose -p "$project" exec -T epi printenv EPI_MODE | grep -qx production
# Not reachable from outside this computer.
docker compose -p "$project" port epi 8080 | grep -q '^127.0.0.1:' || { echo "FAIL: EPI not on 127.0.0.1" >&2; exit 1; }
docker compose -p "$project" port keycloak 8080 | grep -q '^127.0.0.1:' || { echo "FAIL: sign-in not on 127.0.0.1" >&2; exit 1; }

echo "==> Browser: first sign-in, new password, Administration"
cd "$ROOT"
EPI_E2E_URL="http://127.0.0.1:$EPI_PORT" EPI_E2E_UP=1 EPI_UP_EMAIL="$EPI_ADMIN_EMAIL" \
  EPI_UP_PASSWORD="$password" EPI_UP_NEW_PASSWORD="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')" \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
  npx playwright test e2e/local-up.spec.ts --project=desktop

echo "==> Backup and restore include sign-in (Keycloak) accounts"
kq() { docker compose -p "$project" exec -T postgres psql -U epi -d keycloak -tAc "$1"; }
first=$(kq "SELECT first_name FROM user_entity WHERE email = '$EPI_ADMIN_EMAIL'")
backup=$(bash "$ROOT/epi.sh" backup)
echo "$backup" | sed 's/^/    /'
file=$(sed -n 's/^Backup written: \(.*\.sql\.gz\) .*/\1/p' <<<"$backup")
grep -q '^Sign-in backup written: .*/keycloak-' <<<"$backup" || { echo "FAIL: no sign-in backup" >&2; exit 1; }
# Changes after the backup, in EPI and in sign-in; the restore must undo both.
q "INSERT INTO organizations(name) VALUES ('After backup')" >/dev/null
kq "UPDATE user_entity SET first_name = 'Changed' WHERE email = '$EPI_ADMIN_EMAIL'" >/dev/null
bash "$ROOT/epi.sh" restore "$file" --yes | sed 's/^/    /'
[ "$(q "SELECT count(*) FROM organizations WHERE name = 'After backup'")" = 0 ] || { echo "FAIL: EPI data not restored" >&2; exit 1; }
[ "$(kq "SELECT first_name FROM user_entity WHERE email = '$EPI_ADMIN_EMAIL'")" = "$first" ] || { echo "FAIL: sign-in not restored" >&2; exit 1; }
curl -fsS "http://127.0.0.1:$EPI_PORT/health/ready" | grep -q '"oidc":"ok"' || { echo "FAIL: sign-in not ready after restore" >&2; exit 1; }
rm -f "$file" "$(dirname "$file")/keycloak-$(basename "$file" | sed 's/^epi-//')"

echo "==> Second ./epi.sh up: no questions, nothing duplicated"
again=$(bash "$ROOT/epi.sh" up </dev/null)
grep -q 'already an administrator' <<<"$again" || { echo "FAIL: second up: $again" >&2; exit 1; }
[ "$(q "SELECT count(*) FROM users")" = 1 ] && [ "$(q 'SELECT count(*) FROM organizations')" = 1 ]
echo "UP E2E: PASS"
