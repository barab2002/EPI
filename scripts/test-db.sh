#!/usr/bin/env bash
# Ephemeral PostgreSQL for integration tests.
#   scripts/test-db.sh run -- <command...>   run command with EPI_TEST_DATABASE_URL set
# If EPI_TEST_DATABASE_URL is already set (e.g. GitLab service), it is used as-is.
set -euo pipefail
[ "${1:-}" = "run" ] && shift; [ "${1:-}" = "--" ] && shift
if [ -n "${EPI_TEST_DATABASE_URL:-}" ]; then exec "$@"; fi
command -v docker >/dev/null || { echo "test-db: docker not found and EPI_TEST_DATABASE_URL unset" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "test-db: docker daemon not reachable (start Docker or set EPI_TEST_DATABASE_URL)" >&2; exit 2; }
. "$(dirname "${BASH_SOURCE[0]}")/images.sh"
image="$EPI_POSTGRES_IMAGE"
name="epi-test-db-$$"
pw="test-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
docker run -d --rm --name "$name" -e POSTGRES_USER=epi_test -e POSTGRES_PASSWORD="$pw" \
  -e POSTGRES_DB=epi_test -p 127.0.0.1::5432 "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
port=$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U epi_test -d epi_test -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
export EPI_TEST_DATABASE_URL="postgres://epi_test:${pw}@127.0.0.1:${port}/epi_test"
"$@"
