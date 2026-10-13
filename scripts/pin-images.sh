#!/usr/bin/env bash
# Re-resolves the digests in deploy/images.lock from the registry (network required).
# Review `git diff deploy/images.lock` and run the full CI before committing a change.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
reg="${EPI_IMAGE_REGISTRY:-docker.io}"
digest() {
  docker pull -q "$1" >/dev/null
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$1" | head -1 | sed 's/.*@//'
}
node=$(digest "$reg/library/node:22-alpine")
pg=$(digest "$reg/library/postgres:16-alpine")
kc=$(digest "quay.io/keycloak/keycloak:26.3.3")
lock="$ROOT/deploy/images.lock"
sed -i -E \
  -e "s|^(EPI_NODE_REF='library/node:22-alpine@).*'|\1$node'|" \
  -e "s|^(EPI_POSTGRES_REF='library/postgres:16-alpine@).*'|\1$pg'|" \
  -e "s|^(EPI_KEYCLOAK_PINNED='quay.io/keycloak/keycloak:26.3.3@).*'|\1$kc'|" "$lock"
grep -E "^EPI_" "$lock"
