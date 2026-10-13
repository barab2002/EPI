#!/usr/bin/env bash
# Upgrade test (EPI-012c): install bundle v1 from scratch, add data, upgrade to v2 (data kept,
# new image running), refuse same-version and older bundles, then upgrade to a deliberately broken
# v3 whose start creates a table and fails: EPI must roll back to v2 with the pre-upgrade data.
#   scripts/test-upgrade.sh [--keep]      (needs Docker; builds with node/pnpm; synthetic data only)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keep="${1:-}"
project="epi-upgrade-test-$$"
base="$(mktemp -d)"; dir="$base/epi"; bundles="$base/bundles"; mkdir -p "$bundles"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }
export COMPOSE_PROJECT_NAME="$project" EPI_PORT="$(free_port)"
cleanup() {
  status=$?
  [ "$status" -eq 0 ] || docker compose -p "$project" logs --tail 30 epi >&2 2>/dev/null || true
  docker compose -p "$project" down -v >/dev/null 2>&1 || true
  docker rmi -f epi-upgrade-test:v2 epi-upgrade-test:v3 >/dev/null 2>&1 || true
  [ "$keep" = "--keep" ] || rm -rf "$base"
  exit "$status"
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
sql() { docker compose -p "$project" exec -T postgres psql -U epi -d epi -tAc "$1"; }
running_image() { docker inspect --format '{{.Config.Image}}' "$(docker compose -p "$project" ps -q epi)"; }
bundle() { # <version> [source image]
  EPI_BUNDLE_VERSION="$1" EPI_BUNDLE_SOURCE_IMAGE="${2:-}" bash "$ROOT/epi.sh" bundle --no-keycloak | tail -1 >&2
  mv "$ROOT/dist/epi-bundle-$1-"*.tar "$bundles/" && mv "$ROOT/dist/epi-bundle-$1-"*.tar.sha256 "$bundles/"
  ls "$bundles"/epi-bundle-"$1"-*.tar
}

echo "==> Bundles: v1 (fresh build), v2 (same app, new image), v3 (broken on start)"
b1="$(bundle 0.1.0-up1)"
printf 'FROM epi:local\nLABEL org.epi.test=v2\n' | docker build -q -t epi-upgrade-test:v2 - >/dev/null
b2="$(bundle 0.1.0-up2 epi-upgrade-test:v2)"
cat <<'DOCKERFILE' | docker build -q -t epi-upgrade-test:v3 - >/dev/null
FROM epi:local
# Simulates a release whose start fails after changing the database (e.g. a bad migration).
ENTRYPOINT ["node", "-e", "const fs=require('fs');const {Client}=require('pg');const c=new Client({host:'postgres',user:'epi',database:'epi',password:fs.readFileSync('/run/secrets/db_password','utf8').trim()});c.connect().then(()=>c.query('CREATE TABLE IF NOT EXISTS upgrade_junk(x int); DELETE FROM audit_events')).then(()=>{console.error('v3: simulated failure');process.exit(1)})"]
DOCKERFILE
b3="$(bundle 0.1.0-up3 epi-upgrade-test:v3)"

echo "==> Install v1 and add data"
bash "$ROOT/epi.sh" offline-install "$b1" --dir "$dir" | tail -1
(cd "$dir" && ./epi.sh start | tail -1)
sql "INSERT INTO users(display_name) VALUES ('Upgrade Marker')" >/dev/null
audit_before="$(sql 'SELECT count(*) FROM audit_events')"

echo "==> Upgrade v1 → v2"
(cd "$dir" && ./epi.sh upgrade "$b2" --yes) | tail -3
[ "$(running_image)" = "epi-bundle/epi:0.1.0-up2" ] || fail "v2 is not running ($(running_image))"
grep -q '^EPI_VERSION=0.1.0-up2$' "$dir/deploy/offline.env" || fail "installation files not updated"
[ "$(sql "SELECT count(*) FROM users WHERE display_name = 'Upgrade Marker'")" = 1 ] || fail "data lost"
ls "$dir"/backups/epi-*.sql.gz >/dev/null || fail "no backup taken"
curl -fsS "http://127.0.0.1:$EPI_PORT/health/ready" >/dev/null || fail "v2 not healthy"
echo "    v2 running, data kept, backup present: OK"

echo "==> Refuse the same version and an older one"
if (cd "$dir" && ./epi.sh upgrade "$b2" --yes) >"$base/same.log" 2>&1; then fail "same version accepted"; fi
grep -q 'is already installed' "$base/same.log" || fail "unexpected message: $(tail -1 "$base/same.log")"
old="$base/old"; mkdir -p "$old/x"
tar -xf "$b1" -C "$old/x"; top="$(ls "$old/x")"
sed -i 's/^EPI_VERSION=.*/EPI_VERSION=0.0.9-old/' "$old/x/$top/deploy/offline.env"
(cd "$old/x/$top" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
tar -C "$old/x" -cf "$old/older.tar" "$top" && rm -rf "$old/x"
if (cd "$dir" && ./epi.sh upgrade "$old/older.tar" --yes) >"$base/old.log" 2>&1; then fail "downgrade accepted"; fi
grep -q 'downgrades are not supported' "$base/old.log" || fail "unexpected message: $(tail -1 "$base/old.log")"
[ "$(running_image)" = "epi-bundle/epi:0.1.0-up2" ] || fail "refusals changed the installation"
echo "    same version and downgrade refused, v2 untouched: OK"

echo "==> Upgrade v2 → broken v3: must roll back"
audit_v2="$(sql 'SELECT count(*) FROM audit_events')"
if (cd "$dir" && EPI_UPGRADE_HEALTH_TRIES=15 ./epi.sh upgrade "$b3" --yes) >"$base/v3.log" 2>&1; then
  fail "broken upgrade reported success"
fi
tail -2 "$base/v3.log" | sed 's/^/    /'
grep -q 'was rolled back' "$base/v3.log" || fail "no rollback message"
[ "$(running_image)" = "epi-bundle/epi:0.1.0-up2" ] || fail "v2 not running after rollback ($(running_image))"
grep -q '^EPI_VERSION=0.1.0-up2$' "$dir/deploy/offline.env" || fail "files not rolled back"
[ "$(sql "SELECT to_regclass('public.upgrade_junk') IS NULL")" = t ] || fail "the failed version's table survived"
[ "$(sql "SELECT count(*) FROM users WHERE display_name = 'Upgrade Marker'")" = 1 ] || fail "data lost in rollback"
[ "$(sql 'SELECT count(*) FROM audit_events')" -ge "$audit_v2" ] || fail "audit rows deleted by v3 not restored"
[ "$audit_v2" -ge "$audit_before" ] || fail "audit count went down"
grep -q 'simulated failure' "$dir/.epi/upgrade/failed-version.log" ||
  { tail -20 "$dir/.epi/upgrade/failed-version.log" >&2; fail "failed version's logs not kept"; }
curl -fsS "http://127.0.0.1:$EPI_PORT/health/ready" >/dev/null || fail "v2 not healthy after rollback"
echo "    rolled back to v2 with pre-upgrade data, failed version's logs kept: OK"
echo "UPGRADE TEST: PASS"
