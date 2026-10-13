#!/usr/bin/env bash
# Offline install test (EPI-012): build a bundle, drop the bundle's image tags, install into a
# temporary directory, start the stack on a Compose network with no route outside Docker
# (`internal: true`) and wait until PostgreSQL and EPI report healthy; then prove egress fails.
#   scripts/test-offline-install.sh [--keep]      (needs Docker; builds with node/pnpm)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keep="${1:-}"
project="epi-offline-test-$$"
dir="$(mktemp -d)/epi"
cleanup() {
  if [ -f "$dir/epi.sh" ]; then
    (cd "$dir" && COMPOSE_PROJECT_NAME="$project" EPI_COMPOSE_EXTRA="$dir/no-egress.yaml" \
      ./epi.sh stop >/dev/null 2>&1 || true)
    docker compose -p "$project" down -v >/dev/null 2>&1 || true
  fi
  [ "$keep" = "--keep" ] || rm -rf "$(dirname "$dir")"
}
trap cleanup EXIT

echo "==> Building bundle (no demo Keycloak)"
bash "$ROOT/epi.sh" bundle --no-keycloak | tail -2
bundle="$(ls -t "$ROOT"/dist/epi-bundle-*.tar | head -1)"

echo "==> Removing the bundle's image tags so the install must load them from the bundle"
tar -xOf "$bundle" --wildcards '*/images/manifest.tsv' | cut -f1 | xargs -r docker rmi -f >/dev/null 2>&1 || true

echo "==> offline-install"
bash "$ROOT/epi.sh" offline-install "$bundle" --dir "$dir"
grep -q '^EPI_PULL_POLICY=never' "$dir/deploy/offline.env"

cat >"$dir/no-egress.yaml" <<'YAML'
networks:
  default:
    internal: true
YAML
echo "==> Starting on an internal-only network (no egress)"
export COMPOSE_PROJECT_NAME="$project" EPI_COMPOSE_EXTRA="$dir/no-egress.yaml"
export EPI_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
(cd "$dir" && ./epi.sh start --no-wait)
health() { docker inspect --format '{{.State.Health.Status}}' "$(docker compose -p "$project" ps -q "$1")" 2>/dev/null; }
for i in $(seq 1 90); do
  [ "$(health postgres)" = healthy ] && [ "$(health epi)" = healthy ] && break
  [ "$i" -eq 90 ] && { docker compose -p "$project" logs --tail 40 >&2; echo "FAIL: not healthy" >&2; exit 1; }
  sleep 2
done
echo "    postgres: $(health postgres), epi: $(health epi)"
docker compose -p "$project" exec -T epi wget -qO- http://127.0.0.1:8080/health/ready
echo
if docker compose -p "$project" exec -T epi wget -q -T 5 -O /dev/null https://registry-1.docker.io/v2/ 2>/dev/null; then
  echo "FAIL: container reached the internet" >&2; exit 1
fi
echo "    egress blocked: OK"
users=$(docker compose -p "$project" exec -T postgres psql -U epi -d epi -tAc 'SELECT count(*) FROM users')
echo "    synthetic users seeded: $users"
[ "$users" -gt 0 ]
echo "OFFLINE INSTALL TEST: PASS"
