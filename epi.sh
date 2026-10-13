#!/usr/bin/env bash
# EPI operations CLI. Run `./epi.sh help`. Commands that are not implemented yet say so and exit 2.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Installed from an offline bundle: use only the bundled images (never pull).
if [ -f "$ROOT/deploy/offline.env" ]; then set -a; . "$ROOT/deploy/offline.env"; set +a; fi
STATE_DIR="$ROOT/.epi"                       # local runtime state (gitignored), mode 0700
COMPOSE_FILE="$ROOT/deploy/compose.yaml"
export EPI_IMAGE_REGISTRY="${EPI_IMAGE_REGISTRY:-docker.io}"
export EPI_IMAGE="${EPI_IMAGE:-epi:local}"
export EPI_PORT="${EPI_PORT:-8080}"
export EPI_BIND="${EPI_BIND:-127.0.0.1}"
export EPI_DB_PASSWORD_PATH="$STATE_DIR/db_password"
# Pinned third-party images (deploy/images.lock) → EPI_NODE_IMAGE, EPI_POSTGRES_IMAGE, EPI_KEYCLOAK_IMAGE.
. "$ROOT/scripts/images.sh"

WARNINGS=0 FAILURES=0
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; B=$'\e[1m'; N=$'\e[0m'; else G= Y= R= B= N=; fi
pass() { printf '  %sPASS%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %sWARN%s %s\n' "$Y" "$N" "$*"; WARNINGS=$((WARNINGS + 1)); }
fail() { printf '  %sFAIL%s %s\n' "$R" "$N" "$*"; FAILURES=$((FAILURES + 1)); }
die() { printf '%serror:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
info() { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
KC_DIR="$STATE_DIR/keycloak"
demo_sso_enabled() { [ "${EPI_DEMO_SSO:-true}" != "false" ] && [ -z "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ]; }
compose() {
  # EPI_COMPOSE_EXTRA: optional extra Compose override file (site tweaks; used by the offline test).
  set -- ${EPI_COMPOSE_EXTRA:+-f "$EPI_COMPOSE_EXTRA"} "$@"
  if [ -n "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ]; then
    docker compose -f "$COMPOSE_FILE" -f "$ROOT/deploy/compose.oidc.yaml" "$@"
  elif demo_sso_enabled && [ -f "$KC_DIR/epi-demo-realm.json" ]; then
    docker compose -f "$COMPOSE_FILE" -f "$ROOT/deploy/compose.demo-sso.yaml" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

usage() {
  cat <<EOF
EPI — Engineering Performance & Improvement

Usage: ./epi.sh <command> [options]

  doctor              Check prerequisites (PASS/WARN/FAIL with remediation)
  build               Build the app on this host and the runtime image ($EPI_IMAGE)
  demo                Build if needed and start a demo with SYNTHETIC data on http://$EPI_BIND:$EPI_PORT
                      (includes a demo Keycloak on :${EPI_KC_PORT:-8081}; EPI_DEMO_SSO=false to skip)
  credentials         Show this install's demo sign-in users and passwords
  start [--no-wait] | stop   Start / stop the stack (data volume is kept)
  status              Show containers and application health
  logs                Follow application logs
  test [--no-integration]   Run the CI checks (scripts/ci.sh)
  backup              Write a compressed database dump to ./backups/
  restore <file> [--yes]    Replace the database with a backup (destructive; asks first)
  bundle [--no-keycloak]    Build an offline bundle in dist/ (EPI + pinned images, checksums)
  offline-install <bundle.tar> [--dir DIR]
                      Verify and install a bundle on a host without internet (no start)
  install | upgrade   Not implemented yet (backlog EPI-012)

Environment: EPI_IMAGE_REGISTRY (image mirror, default docker.io), EPI_PORT (8080),
EPI_BIND (127.0.0.1 — binding to other interfaces requires approval).
Single sign-on (optional): EPI_OIDC_ISSUER, EPI_OIDC_CLIENT_ID (epi-web), EPI_PUBLIC_URL and
EPI_OIDC_CLIENT_SECRET_PATH (a root-only file holding the client secret). See docs/KEYCLOAK.md.
EOF
}

ensure_state() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  if [ ! -s "$EPI_DB_PASSWORD_PATH" ]; then
    (umask 077 && od -An -N24 -tx1 /dev/urandom | tr -d ' \n' >"$EPI_DB_PASSWORD_PATH")
  fi
  # Compose (non-swarm) mounts secret files with host permissions; the app runs as non-root
  # uid 1000, so the file must be world-readable. Host protection comes from the 0700 directory.
  chmod 644 "$EPI_DB_PASSWORD_PATH"
}

cmd_doctor() {
  WARNINGS=0 FAILURES=0
  info "EPI doctor"
  if command -v docker >/dev/null; then pass "docker CLI $(docker --version | awk '{print $3}' | tr -d ,)"; else fail "docker not installed — install Docker Engine 24+"; fi
  if docker info >/dev/null 2>&1; then pass "docker daemon reachable"; else fail "docker daemon not reachable — start Docker (e.g. 'sudo systemctl start docker') or add your user to the docker group"; fi
  if docker compose version >/dev/null 2>&1; then pass "docker compose $(docker compose version --short 2>/dev/null)"; else fail "docker compose v2 plugin missing"; fi
  local cpus mem_gb disk_gb
  cpus=$(nproc 2>/dev/null || echo 0)
  [ "$cpus" -ge 2 ] && pass "CPU: $cpus cores" || warn "CPU: $cpus cores (2+ recommended)"
  mem_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0)
  [ "$mem_gb" -ge 4 ] && pass "RAM: ${mem_gb} GB" || warn "RAM: ${mem_gb} GB (4 GB+ recommended)"
  disk_gb=$(df -Pk "$ROOT" | awk 'NR==2 {printf "%d", $4/1024/1024}')
  [ "$disk_gb" -ge 5 ] && pass "Free disk: ${disk_gb} GB" || fail "Free disk: ${disk_gb} GB (5 GB+ required)"
  if command -v ss >/dev/null && ss -ltn "( sport = :$EPI_PORT )" 2>/dev/null | grep -q LISTEN; then
    if compose ps --status running 2>/dev/null | grep -q epi-epi; then pass "port $EPI_PORT in use by EPI"; else fail "port $EPI_PORT is in use — set EPI_PORT"; fi
  else
    pass "port $EPI_PORT free"
  fi
  if [ -n "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ]; then
    [ -r "$EPI_OIDC_CLIENT_SECRET_PATH" ] && pass "OIDC client secret file readable" || fail "EPI_OIDC_CLIENT_SECRET_PATH not readable"
    [ -n "${EPI_OIDC_ISSUER:-}" ] && [ -n "${EPI_PUBLIC_URL:-}" ] || fail "OIDC needs EPI_OIDC_ISSUER and EPI_PUBLIC_URL"
    if [ -n "${EPI_OIDC_ISSUER:-}" ]; then
      if curl -fsS --max-time 10 "$EPI_OIDC_ISSUER/.well-known/openid-configuration" >/dev/null 2>&1; then
        pass "OIDC issuer reachable: $EPI_OIDC_ISSUER"
      else
        fail "OIDC issuer not reachable from this host: $EPI_OIDC_ISSUER (DNS/firewall/CA? set NODE_EXTRA_CA_CERTS for an internal CA)"
      fi
    fi
  else
    pass "OIDC not configured (demo sign-in only)"
  fi
  if [ "$EPI_BIND" != "127.0.0.1" ]; then warn "EPI_BIND=$EPI_BIND exposes EPI beyond localhost — requires approval and TLS"; fi
  if docker image inspect "$EPI_IMAGE" >/dev/null 2>&1; then pass "image $EPI_IMAGE present"; else warn "image $EPI_IMAGE not built yet — run ./epi.sh build"; fi
  if demo_sso_enabled; then
    if docker image inspect "$EPI_KEYCLOAK_IMAGE" >/dev/null 2>&1; then pass "keycloak image present (demo SSO)"; else warn "keycloak image not present locally — will be pulled ($EPI_KEYCLOAK_IMAGE)"; fi
  fi
  if docker image inspect "$EPI_POSTGRES_IMAGE" >/dev/null 2>&1; then pass "postgres image present"; else warn "postgres image not present locally — will be pulled ($EPI_POSTGRES_IMAGE)"; fi
  if command -v node >/dev/null && command -v pnpm >/dev/null; then pass "build tools: node $(node --version), pnpm $(pnpm --version)"; else warn "node/pnpm missing — needed only for ./epi.sh build"; fi
  printf '\nResult: %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"
  [ "$FAILURES" -eq 0 ]
}

cmd_build() {
  [ -z "${EPI_OFFLINE:-}" ] || die "this is an offline install: the image comes from the bundle (nothing to build)"
  command -v pnpm >/dev/null || die "pnpm is required to build (Node 22 + pnpm 10)"
  info "Installing dependencies (frozen lockfile)"
  (cd "$ROOT" && pnpm install --frozen-lockfile --prefer-offline)
  info "Building API and web"
  (cd "$ROOT" && pnpm --filter @epi/api run build && pnpm --filter @epi/web run build)
  info "Assembling production artifacts"
  rm -rf "$ROOT/build"
  (cd "$ROOT" && pnpm --filter @epi/api deploy --prod --legacy build/api >/dev/null)
  rm -rf "$ROOT/build/api/src" "$ROOT/build/api/test"
  cp -r "$ROOT/apps/web/dist" "$ROOT/build/web"
  info "Building image $EPI_IMAGE"
  docker build -f "$ROOT/deploy/Dockerfile" --build-arg EPI_NODE_IMAGE="$EPI_NODE_IMAGE" -t "$EPI_IMAGE" "$ROOT"
}

wait_healthy() {
  local url="http://127.0.0.1:$EPI_PORT/health/ready"
  for _ in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# Demo realm generator runs with the host's node, or with node inside the EPI image (offline hosts).
gen_demo_realm() {
  mkdir -p "$KC_DIR" && chmod 700 "$KC_DIR"
  if command -v node >/dev/null; then
    node "$ROOT/scripts/kc-demo-realm.mjs" "$KC_DIR" "http://127.0.0.1:$EPI_PORT"
  else
    docker run --rm --network none --entrypoint node -u "$(id -u):$(id -g)" \
      -v "$ROOT/scripts/kc-demo-realm.mjs:/realm.mjs:ro" -v "$KC_DIR:/out" \
      "$EPI_IMAGE" /realm.mjs /out "http://127.0.0.1:$EPI_PORT"
  fi
}

cmd_offline_install() {
  local bundle="" dir="$PWD/epi"
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) dir="${2:?--dir needs a path}"; shift 2 ;;
      *) bundle="$1"; shift ;;
    esac
  done
  [ -n "$bundle" ] && [ -f "$bundle" ] || die "usage: ./epi.sh offline-install <epi-bundle-….tar> [--dir DIR]"
  docker info >/dev/null 2>&1 || die "docker daemon not reachable — start Docker first (./epi.sh doctor)"
  docker compose version >/dev/null 2>&1 || die "docker compose v2 plugin missing"
  [ ! -e "$dir/epi.sh" ] || die "$dir already contains an installation (upgrade is not implemented yet)"
  if [ -f "$bundle.sha256" ]; then
    info "Verifying bundle checksum"
    (cd "$(dirname "$bundle")" && sha256sum -c --quiet "$(basename "$bundle").sha256") || die "bundle checksum mismatch — copy it again"
  else
    warn "no $bundle.sha256 next to the bundle; checking the contents' checksums only"
  fi
  info "Extracting to $dir"
  mkdir -p "$dir"
  tar -xf "$bundle" -C "$dir" --strip-components=1 --no-same-owner
  (cd "$dir" && sha256sum -c --quiet SHA256SUMS) || die "bundle contents are corrupt (SHA256SUMS mismatch)"
  local tag file manifest_id config_id id
  while IFS=$'\t' read -r tag file manifest_id config_id; do
    info "Loading $tag"
    docker load -q -i "$dir/$file" >/dev/null || die "docker load failed for $file"
    id="$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null)" || die "$tag missing after load"
    [ "$id" = "$manifest_id" ] || [ "$id" = "$config_id" ] || die "$tag has unexpected identity $id"
    rm -f "$dir/$file"
  done <"$dir/images/manifest.tsv"
  printf '\n%sEPI %s installed in %s%s (images loaded and verified; nothing was downloaded).\n' "$G" "$(sed -n 's/^EPI_VERSION=//p' "$dir/deploy/offline.env")" "$dir" "$N"
  printf 'Next:\n  cd %s && ./epi.sh doctor\n  ./epi.sh demo    # synthetic demo\nProduction (your Keycloak): see docs/OFFLINE_INSTALL.md\n' "$dir"
}

cmd_demo() {
  cmd_doctor || die "doctor reported failures; fix them and retry"
  docker image inspect "$EPI_IMAGE" >/dev/null 2>&1 || cmd_build
  ensure_state
  if demo_sso_enabled; then
    gen_demo_realm
  fi
  info "Starting demo stack (synthetic data)"
  EPI_MODE=demo compose up -d
  info "Waiting for health"
  if wait_healthy; then
    printf '\n%sEPI demo is running:%s http://%s:%s  (API docs: /api/docs)\n' "$G" "$N" "$EPI_BIND" "$EPI_PORT"
    printf 'All people and data are synthetic. Sign in by choosing a demo person'
    if demo_sso_enabled; then
      printf ', or use single sign-on with these demo accounts:\n\n'
      cat "$KC_DIR/demo-credentials.txt"
      printf '\nShow them again any time with: ./epi.sh credentials\n'
    else
      printf '.\n'
    fi
  else
    compose logs --tail 50 epi >&2
    die "EPI did not become healthy; see logs above"
  fi
}

cmd_status() {
  compose ps
  if curl -fsS "http://127.0.0.1:$EPI_PORT/health/ready" 2>/dev/null; then echo; else echo "health: not ready"; return 1; fi
}

cmd_backup() {
  ensure_state
  compose ps --status running postgres | grep -q postgres || die "postgres is not running (./epi.sh start)"
  mkdir -p "$ROOT/backups"
  local file="$ROOT/backups/epi-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  (umask 077 && compose exec -T postgres pg_dump -U epi -d epi --clean --if-exists --no-owner | gzip >"$file")
  [ -s "$file" ] || die "backup is empty"
  gzip -t "$file" || die "backup is corrupt"
  printf 'Backup written: %s (%s)\n' "$file" "$(du -h "$file" | cut -f1)"
}

cmd_restore() {
  local file="${1:-}" yes="${2:-}"
  [ -n "$file" ] && [ -f "$file" ] || die "usage: ./epi.sh restore <backup.sql.gz> [--yes]"
  gzip -t "$file" || die "not a valid gzip backup: $file"
  if [ "$yes" != "--yes" ]; then
    printf '%sThis REPLACES all EPI data with %s.%s Type "restore" to continue: ' "$Y" "$file" "$N"
    read -r answer
    [ "$answer" = "restore" ] || die "aborted"
  fi
  compose stop epi >/dev/null
  gunzip -c "$file" | compose exec -T postgres psql -U epi -d epi -v ON_ERROR_STOP=1 -q >/dev/null
  compose start epi >/dev/null
  wait_healthy && echo "Restore complete; EPI healthy." || die "EPI unhealthy after restore"
}

not_yet() {
  printf '%s: not implemented yet (%s). Use ./epi.sh demo for now.\n' "$1" "$2" >&2
  exit 2
}

case "${1:-help}" in
  doctor) cmd_doctor ;;
  build) cmd_build ;;
  demo) cmd_demo ;;
  start)
    ensure_state
    if [ "${2:-}" = "--no-wait" ]; then compose up -d; exit 0; fi
    compose up -d; wait_healthy && echo "EPI is up on http://$EPI_BIND:$EPI_PORT" ;;
  stop) compose stop ;;
  status) cmd_status ;;
  logs) compose logs -f epi ;;
  credentials)
    [ -f "$KC_DIR/demo-credentials.txt" ] || die "no demo credentials yet — run ./epi.sh demo"
    cat "$KC_DIR/demo-credentials.txt" ;;
  test) shift; bash "$ROOT/scripts/ci.sh" "$@" ;;
  backup) cmd_backup ;;
  restore) shift; cmd_restore "$@" ;;
  install) not_yet install "production config + Keycloak, backlog EPI-003/EPI-012" ;;
  upgrade) not_yet upgrade "backlog EPI-012" ;;
  offline-install) shift; cmd_offline_install "$@" ;;
  bundle)
    [ -z "${EPI_OFFLINE:-}" ] || die "bundles are built from the source repository, not an installation"
    shift; bash "$ROOT/scripts/bundle.sh" "$@" ;;
  help | -h | --help) usage ;;
  *) usage; exit 64 ;;
esac
