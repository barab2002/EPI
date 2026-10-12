#!/usr/bin/env bash
# Ephemeral Keycloak (dev mode, in-memory) for OIDC integration tests.
#   scripts/test-keycloak.sh run -- <command...>
# Exports EPI_TEST_KEYCLOAK_URL and a random bootstrap admin login for the test to create its own
# throwaway realm. Never use this container for anything but tests.
set -euo pipefail
[ "${1:-}" = "run" ] && shift; [ "${1:-}" = "--" ] && shift
if [ -n "${EPI_TEST_KEYCLOAK_URL:-}" ]; then exec "$@"; fi
docker info >/dev/null 2>&1 || { echo "test-keycloak: docker daemon not reachable" >&2; exit 2; }
image="${EPI_KEYCLOAK_IMAGE:-quay.io/keycloak/keycloak:26.3.3}"
name="epi-test-kc-$$"
pw="kc-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
docker run -d --rm --name "$name" -p 127.0.0.1::8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=epi-test-admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$pw" \
  "$image" start-dev >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
port=$(docker port "$name" 8080/tcp | head -1 | sed 's/.*://')
url="http://127.0.0.1:${port}"
for i in $(seq 1 120); do
  curl -fsS "$url/realms/master/.well-known/openid-configuration" >/dev/null 2>&1 && break
  [ "$i" -eq 120 ] && { echo "test-keycloak: not ready after 120 s" >&2; docker logs --tail 30 "$name" >&2; exit 1; }
  sleep 1
done
export EPI_TEST_KEYCLOAK_URL="$url" EPI_TEST_KEYCLOAK_ADMIN_USER=epi-test-admin EPI_TEST_KEYCLOAK_ADMIN_PASSWORD="$pw"
"$@"
