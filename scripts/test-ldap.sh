#!/usr/bin/env bash
# Ephemeral SYNTHETIC directory (OpenLDAP over LDAPS, test CA) for directory integration tests.
#   scripts/test-ldap.sh run -- <command...>
# Exports EPI_TEST_LDAP_URL (ldaps://localhost:<port>), EPI_TEST_LDAP_CA_FILE and
# EPI_TEST_LDAP_FIXTURE (dir with passwords.env). Never use this directory for anything but tests.
set -euo pipefail
[ "${1:-}" = "run" ] && shift; [ "${1:-}" = "--" ] && shift
if [ -n "${EPI_TEST_LDAP_URL:-}" ]; then exec "$@"; fi
docker info >/dev/null 2>&1 || { echo "test-ldap: docker daemon not reachable" >&2; exit 2; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; name="epi-test-ldap-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
bash "$here/dev/ldap-fixture.sh" "$work/fx" >/dev/null
bash "$here/dev/ldap-run.sh" "$work/fx" "$name" -p 127.0.0.1::636
port=$(docker port "$name" 636/tcp | head -1 | sed 's/.*://')
export EPI_TEST_LDAP_URL="ldaps://localhost:$port" EPI_TEST_LDAP_CA_FILE="$work/fx/certs/ca.crt" \
  EPI_TEST_LDAP_FIXTURE="$work/fx" EPI_TEST_LDAP_CONTAINER="$name"
"$@"
