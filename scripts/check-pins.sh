#!/usr/bin/env bash
# Fails when a third-party image is referenced without the digest from deploy/images.lock.
# Compose defaults and the Dockerfile ARG default are fallbacks; epi.sh always passes the pins.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
. deploy/images.lock
status=0
check() { # file, required pinned ref
  grep -qF -- "$2" "$1" || { echo "check-pins: $1 does not reference $2" >&2; status=1; }
}
check .gitlab-ci.yml "$EPI_NODE_REF"
check .gitlab-ci.yml "$EPI_POSTGRES_REF"
for f in epi.sh scripts/test-db.sh scripts/test-keycloak.sh; do
  grep -q 'images.sh' "$f" || { echo "check-pins: $f does not source scripts/images.sh" >&2; status=1; }
done
grep -q 'EPI_NODE_IMAGE="$EPI_NODE_IMAGE"' epi.sh || { echo "check-pins: epi.sh build does not pass EPI_NODE_IMAGE" >&2; status=1; }
[ "$status" -eq 0 ] && echo "check-pins: PASS (node, postgres, keycloak pinned by digest)"
exit "$status"
