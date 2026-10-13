#!/usr/bin/env bash
# End-to-end test of production sign-in with a directory (EPI-003b): a SYNTHETIC OpenLDAP over
# LDAPS (test CA) → Keycloak from deploy/compose.sso.yaml (production mode, own database, file
# vault, truststore) → EPI, which also reads the team groups for the AD team import (EPI-004c). Uses ./epi.sh sso-setup/start with a temporary state directory and
# Compose project; everything is removed afterwards. Requires the epi:local image (./epi.sh build).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/images.sh"
work="$(mktemp -d)"; chmod 700 "$work"
project="epi-sso-test-$$"
net="${project}_net"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }
export EPI_STATE_DIR="$work/state" COMPOSE_PROJECT_NAME="$project"
export EPI_PORT="$(free_port)" EPI_SSO_PORT="$(free_port)"
export EPI_MODE=demo EPI_COOKIE_SECURE=false EPI_COMPOSE_EXTRA="$work/net.yaml"
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p "$project" logs --tail 40 keycloak epi 2>/dev/null | tail -60 >&2 || true
  fi
  docker compose -p "$project" down -v >/dev/null 2>&1 || true
  docker rm -f "$project-ldap" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

echo "==> Synthetic directory (LDAPS, test CA)"
bash "$ROOT/scripts/dev/ldap-fixture.sh" "$work/fx" >/dev/null
docker network create "$net" >/dev/null
bash "$ROOT/scripts/dev/ldap-run.sh" "$work/fx" "$project-ldap" --network "$net" --network-alias ldap
. "$work/fx/passwords.env"
printf 'networks:\n  default:\n    name: %s\n    external: true\n' "$net" >"$work/net.yaml"

echo "==> sso-setup (operator inputs: sso.conf, bind password file, CA file)"
mkdir -p "$EPI_STATE_DIR/sso"; chmod 700 "$EPI_STATE_DIR" "$EPI_STATE_DIR/sso"
cat >"$EPI_STATE_DIR/sso.conf" <<CONF
EPI_PUBLIC_URL=http://127.0.0.1:$EPI_PORT
EPI_SSO_PUBLIC_URL=http://127.0.0.1:$EPI_SSO_PORT
EPI_SSO_ALLOW_HTTP=true
EPI_LDAP_VENDOR=other
EPI_LDAP_URL=ldaps://ldap:636
EPI_LDAP_BIND_DN=cn=svc-epi-read,dc=corp,dc=example
EPI_LDAP_USERS_DN=ou=Users,dc=corp,dc=example
EPI_LDAP_GROUPS_DN=ou=Groups,dc=corp,dc=example
EPI_LDAP_TEAM_GROUPS=cn=Team-Payments,ou=Groups,dc=corp,dc=example;cn=Team-Platform,ou=Groups,dc=corp,dc=example
CONF
(umask 077; printf '%s\n' "$LDAP_PW_SVC" >"$EPI_STATE_DIR/sso/ldap_bind_password")
cp "$work/fx/certs/ca.crt" "$EPI_STATE_DIR/sso/ldap-ca.pem"
bash "$ROOT/epi.sh" sso-setup | tail -3
if grep -rqF "$LDAP_PW_SVC" "$EPI_STATE_DIR/sso/epi-realm.json"; then
  echo "FAIL: bind password inlined in the realm file" >&2; exit 1
fi

echo "==> Starting PostgreSQL + Keycloak (production mode) + EPI"
bash "$ROOT/epi.sh" start | tail -1
kc="http://127.0.0.1:$EPI_SSO_PORT"
curl -fsS "$kc/realms/epi/.well-known/openid-configuration" | grep -q "\"issuer\":\"$kc/realms/epi\""
echo "    issuer OK; keycloak database: $(docker compose -p "$project" exec -T postgres psql -U epi -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname='keycloak'")"

echo "==> Directory import: EPI reads the team groups with the same read-only account"
check=$(docker compose -p "$project" exec -T epi node dist/cli.js directory-check)
echo "$check" | sed 's/^/    /'
echo "$check" | grep -q '2 member(s)  Team-Payments' && echo "$check" | grep -q '1 member(s)  Team-Platform' ||
  { echo "FAIL: directory-check did not read the team groups" >&2; exit 1; }

echo "==> First administrator with setup-admin (existing person, same e-mail as in the directory)"
out=$(bash "$ROOT/epi.sh" cli setup-admin --name "Gal Groupman" --email gal.groupman@example.invalid)
echo "$out" | sed 's/^/    /'
echo "$out" | grep -q 'existing person; administrator role granted' ||
  { echo "FAIL: setup-admin did not grant the role" >&2; exit 1; }

echo "==> Browser sign-in"
cd "$ROOT"
EPI_E2E_URL="http://127.0.0.1:$EPI_PORT" EPI_E2E_SSO_LDAP=1 LDAP_PW_TAYLOR="$LDAP_PW_TAYLOR" \
  LDAP_PW_GAL="$LDAP_PW_GAL" LDAP_PW_OUTSIDER="$LDAP_PW_OUTSIDER" \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
  npx playwright test e2e/sso-ldap.spec.ts --project=desktop

echo "==> Keycloak stores no passwords for directory users"
q() { docker compose -p "$project" exec -T postgres psql -U epi -d keycloak -tAc "$1"; }
users=$(q "SELECT count(*) FROM user_entity u JOIN realm r ON r.id = u.realm_id WHERE r.name = 'epi'")
creds=$(q "SELECT count(*) FROM credential c JOIN user_entity u ON u.id = c.user_id JOIN realm r ON r.id = u.realm_id WHERE r.name = 'epi'")
linked=$(q "SELECT count(*) FROM user_entity u JOIN realm r ON r.id = u.realm_id WHERE r.name = 'epi' AND u.federation_link IS NOT NULL")
[ "$users" -ge 2 ] && [ "$linked" = "$users" ] || { echo "FAIL: epi realm users=$users federated=$linked" >&2; exit 1; }
[ "$creds" = "0" ] || { echo "FAIL: $creds stored credential(s) in realm epi" >&2; exit 1; }
echo "    realm epi: $users directory-linked user(s), 0 stored credentials"
echo "SSO LDAP E2E: PASS"
