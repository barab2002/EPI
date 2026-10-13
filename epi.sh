#!/usr/bin/env bash
# EPI operations CLI. Run `./epi.sh help`. Commands that are not implemented yet say so and exit 2.
set -euo pipefail

# EPI_UPGRADE_ROOT: set only by `upgrade`, which runs from a temporary copy of this script so the
# installation files (this file included) can be replaced safely while it runs.
ROOT="${EPI_UPGRADE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# Installed from an offline bundle: use only the bundled images (never pull).
if [ -f "$ROOT/deploy/offline.env" ]; then set -a; . "$ROOT/deploy/offline.env"; set +a; fi
STATE_DIR="${EPI_STATE_DIR:-$ROOT/.epi}"      # local runtime state (gitignored), mode 0700
export EPI_STATE_DIR="$STATE_DIR"
SSO_DIR="$STATE_DIR/sso"
# Reads KEY=value lines literally (same rules as scripts/kc-prod-realm.mjs parseConf): never
# executed as shell, so ";" in group lists and spaces in DNs ("OU=Service Accounts") are kept.
load_conf() {
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || { echo "epi: $1: cannot parse line: $line" >&2; exit 1; }
    key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    export "$key=$value"
  done <"$1"
}
# Production SSO configured (./epi.sh sso-setup): export its non-secret settings for Compose.
if [ -f "$SSO_DIR/epi-realm.json" ] && [ -f "$STATE_DIR/sso.conf" ]; then
  load_conf "$STATE_DIR/sso.conf"
fi
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
LOCAL_DIR="$STATE_DIR/local"   # `up` without AD: local sign-in realm and its secrets
# Which stack the shared commands (start, stop, backup, …) act on: "demo" after `./epi.sh demo`,
# "real" after `./epi.sh up`; unset on servers, where the configured sign-in decides.
RUN_MODE="${EPI_RUN_MODE:-$(cat "$STATE_DIR/run-mode" 2>/dev/null || true)}"
prod_sso_enabled() { [ "$RUN_MODE" != demo ] && [ -f "$SSO_DIR/epi-realm.json" ] && [ -z "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ]; }
local_sso_enabled() { [ "$RUN_MODE" != demo ] && [ -f "$LOCAL_DIR/epi-local-realm.json" ] && [ -z "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ] && ! prod_sso_enabled; }
demo_sso_enabled() { [ "${EPI_DEMO_SSO:-true}" != "false" ] && [ -z "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ] && ! prod_sso_enabled && ! local_sso_enabled; }
compose() {
  # EPI_COMPOSE_EXTRA: optional extra Compose override file (site tweaks; used by the offline test).
  set -- ${EPI_COMPOSE_EXTRA:+-f "$EPI_COMPOSE_EXTRA"} "$@"
  if [ -n "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ]; then
    docker compose -f "$COMPOSE_FILE" -f "$ROOT/deploy/compose.oidc.yaml" "$@"
  elif prod_sso_enabled; then
    docker compose -f "$COMPOSE_FILE" -f "$ROOT/deploy/compose.sso.yaml" "$@"
  elif local_sso_enabled; then
    docker compose -f "$COMPOSE_FILE" -f "$ROOT/deploy/compose.local.yaml" "$@"
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
  up                  Start the REAL app on this computer in one command: builds if needed (in Docker
                      when Node/pnpm are missing), production mode, empty database, you become the
                      administrator; sign-in with Active Directory if .epi/sso.conf exists
  demo                Build if needed and start a demo with SYNTHETIC data on http://$EPI_BIND:$EPI_PORT
                      (includes a demo Keycloak on :${EPI_KC_PORT:-8081}; EPI_DEMO_SSO=false to skip)
  credentials         Show this install's demo sign-in users and passwords
  sso-setup           Configure sign-in with Active Directory (.epi/sso.conf; see docs/KEYCLOAK.md)
  sso-apply           Apply later .epi/sso.conf changes (team groups, addresses) to a running install
  source-token <REF> [--remove]
                      Store a Jira/GitLab token on this server (asks for it; never in chat or Git)
  source-ca <ca.pem>  Trust the company CA of Jira/GitLab https certificates
  cli <command> ...   Run a server command in the app (setup-admin, directory-check, jira-check, …;
                      ./epi.sh cli help lists them)
  start [--no-wait] | stop   Start / stop the stack (data volume is kept)
  status              Show containers and application health
  logs                Follow application logs
  test [--no-integration]   Run the CI checks (scripts/ci.sh)
  backup              Write compressed dumps of the data (and sign-in, when it runs here) to ./backups/
  restore <file> [--yes]    Replace the database with a backup (destructive; asks first)
  bundle [--no-keycloak]    Build an offline bundle in dist/ (EPI + pinned images, checksums)
  offline-install <bundle.tar> [--dir DIR]
                      Verify and install a bundle on a host without internet (no start)
  upgrade <bundle> [--yes]  Upgrade an installation from a newer bundle (backup, migrate, health check, automatic rollback)
  install             Not implemented yet (use offline-install; backlog EPI-012)

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
  # Jira/GitLab tokens (./epi.sh source-token); mounted read-only into the app container.
  mkdir -p "$STATE_DIR/sources"; chmod 755 "$STATE_DIR/sources"
  [ -f "$STATE_DIR/sources/ca.pem" ] || : >"$STATE_DIR/sources/ca.pem"
  chmod 644 "$STATE_DIR/sources/ca.pem"
}

# Trusts the company CA that issued the Jira/GitLab https certificates (PEM; applies on restart).
cmd_source_ca() {
  local pem="${1:-}" target
  [ -n "$pem" ] || die "usage: ./epi.sh source-ca <ca.pem>   (the CA that issued Jira's/GitLab's https certificates)"
  [ -r "$pem" ] || die "cannot read $pem"
  grep -q -- '-----BEGIN CERTIFICATE-----' "$pem" || die "$pem is not a PEM certificate"
  ! grep -q -- 'PRIVATE KEY-----' "$pem" || die "$pem contains a private key — give only the CA certificate"
  ensure_state
  target="$STATE_DIR/sources/ca.pem"
  cp "$pem" "$target.tmp" && mv "$target.tmp" "$target"
  chmod 644 "$target"
  info "Company CA saved. Restart EPI (./epi.sh stop && ./epi.sh start), then Test connection in Administration › Settings."
}

# Stores a Jira/GitLab token for a connection's reference name (Administration › Settings shows
# it, e.g. EPI_JIRA_TOKEN). Read from the terminal without echo, or from stdin; never an argument.
cmd_source_token() {
  local ref="${1:-}" file token
  [[ "$ref" =~ ^[A-Z][A-Z0-9_]{2,63}$ ]] || die "usage: ./epi.sh source-token <REFERENCE>  (e.g. EPI_JIRA_TOKEN; shown in Administration › Settings)"
  ensure_state
  file="$STATE_DIR/sources/$(printf '%s' "$ref" | tr 'A-Z' 'a-z')"
  if [ "${2:-}" = "--remove" ]; then
    rm -f "$file"; info "$ref removed"; return
  fi
  if [ -t 0 ]; then
    read -r -s -p "Paste the token for $ref (input hidden), then Enter: " token; echo
  else
    IFS= read -r token || true
  fi
  token="${token%$'\r'}"
  [ -n "$token" ] || die "no token given; nothing changed"
  # 0644 inside the 0700 state dir: the non-root container user must read it (same as the DB secret).
  (umask 022 && printf '%s\n' "$token" >"$file.tmp") && mv "$file.tmp" "$file"
  chmod 644 "$file"
  info "$ref saved on this server. In Administration › Settings, use Test connection."
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

# Fingerprint of the sources that go into the image (empty outside a Git checkout): the image
# carries it as a label, so `up`/`demo` rebuild only when the code changed.
source_fingerprint() {
  command -v git >/dev/null && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || return 0
  { git -C "$ROOT" rev-parse HEAD
    git -C "$ROOT" diff HEAD -- apps deploy/Dockerfile deploy/Dockerfile.source deploy/entrypoint.sh \
      package.json pnpm-lock.yaml pnpm-workspace.yaml
    git -C "$ROOT" ls-files --others --exclude-standard -- apps
  } | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-16
}

# Builds the image when it is missing or older than the sources (never on offline installs).
ensure_image() {
  if [ -n "${EPI_OFFLINE:-}" ]; then
    docker image inspect "$EPI_IMAGE" >/dev/null 2>&1 || die "image $EPI_IMAGE not found (load the bundle again)"
    return 0
  fi
  local want have
  if ! have="$(docker image inspect --format '{{ index .Config.Labels "org.epi.source" }}' "$EPI_IMAGE" 2>/dev/null)"; then
    cmd_build; return 0
  fi
  want="$(source_fingerprint)"
  if [ -n "$want" ] && [ "$want" != "$have" ]; then
    info "The code changed since the last build: rebuilding"; cmd_build
  fi
}

cmd_build() {
  [ -z "${EPI_OFFLINE:-}" ] || die "this is an offline install: the image comes from the bundle (nothing to build)"
  local label="org.epi.source=$(source_fingerprint)"
  if ! command -v pnpm >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] === 22 ? 0 : 1)' 2>/dev/null; then
    # No Node 22 + pnpm here: build inside Docker (downloads packages during the build only).
    info "Building $EPI_IMAGE inside Docker (no Node 22 + pnpm on this computer; first build takes a few minutes)"
    local ca=()
    if [ -n "${EPI_BUILD_CA_FILE:-}" ]; then
      [ -r "$EPI_BUILD_CA_FILE" ] || die "EPI_BUILD_CA_FILE is not readable: $EPI_BUILD_CA_FILE"
      ca=(--secret "id=build_ca,src=$EPI_BUILD_CA_FILE")
    fi
    DOCKER_BUILDKIT=1 docker build -f "$ROOT/deploy/Dockerfile.source" \
      --build-arg EPI_NODE_IMAGE="$EPI_NODE_IMAGE" --build-arg HTTPS_PROXY --build-arg HTTP_PROXY \
      --build-arg NO_PROXY ${ca[@]+"${ca[@]}"} --label "$label" -t "$EPI_IMAGE" "$ROOT" ||
      die "build failed. Behind a company proxy that inspects HTTPS, set EPI_BUILD_CA_FILE to its CA certificate (PEM) and retry"
    return
  fi
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
  docker build -f "$ROOT/deploy/Dockerfile" --build-arg EPI_NODE_IMAGE="$EPI_NODE_IMAGE" \
    --label "$label" -t "$EPI_IMAGE" "$ROOT"
}

wait_healthy() {
  local url="http://127.0.0.1:$EPI_PORT/health/ready" tries="${1:-90}"
  for _ in $(seq 1 "$tries"); do
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

random_secret() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

# Configures production sign-in with Active Directory (EPI-003b). Inputs, all in the state dir:
#   sso.conf (non-secret, from deploy/sso.conf.example), sso/ldap_bind_password, sso/ldap-ca.pem
cmd_sso_setup() {
  ensure_state
  local conf="$STATE_DIR/sso.conf" bind="$SSO_DIR/ldap_bind_password" ca="$SSO_DIR/ldap-ca.pem"
  mkdir -p "$SSO_DIR/vault" "$SSO_DIR/ca"; chmod 700 "$SSO_DIR"
  [ -f "$conf" ] || die "missing $conf — copy deploy/sso.conf.example there and fill in your AD details"
  [ -s "$bind" ] || die "missing $bind — put the read-only AD bind account's password there (one line; never in Git or chat)"
  if grep -q '^EPI_LDAP_URL=ldaps://' "$conf"; then
    [ -s "$ca" ] || die "missing $ca — the PEM certificate of the CA that issued your domain controllers' LDAPS certificates"
    grep -q 'BEGIN CERTIFICATE' "$ca" || die "$ca is not a PEM certificate"
    cp "$ca" "$SSO_DIR/ca/ldap-ca.pem"
  fi
  # Keycloak file vault: realm "epi", key "ldapbind". Readable by the non-root container (0700 dir).
  tr -d '\r\n' <"$bind" >"$SSO_DIR/vault/epi_ldapbind"
  local f
  for f in kc_db_password kc_admin_password; do
    [ -s "$SSO_DIR/$f" ] || (umask 077 && random_secret >"$SSO_DIR/$f")
  done
  chmod 644 "$SSO_DIR/vault/epi_ldapbind" "$SSO_DIR/kc_db_password" "$SSO_DIR/kc_admin_password" "$SSO_DIR"/ca/* 2>/dev/null || true
  chmod 755 "$SSO_DIR/vault" "$SSO_DIR/ca"
  info "Generating Keycloak realm 'epi' (read-only directory federation)"
  if command -v node >/dev/null; then
    node "$ROOT/scripts/kc-prod-realm.mjs" "$conf" "$SSO_DIR"
  else
    docker run --rm --network none --entrypoint node -u "$(id -u):$(id -g)" \
      -v "$ROOT/scripts/kc-prod-realm.mjs:/realm.mjs:ro" -v "$conf:/sso.conf:ro" -v "$SSO_DIR:/out" \
      "$EPI_IMAGE" /realm.mjs /sso.conf /out
  fi
  printf '\nSingle sign-on configured. Start with: ./epi.sh start\n'
  printf 'Keycloak admin console (emergency only): user "admin", password in %s\n' "$SSO_DIR/kc_admin_password"
  printf 'Later changes to sso.conf: ./epi.sh sso-apply (with EPI running).\n'
}

# Applies .epi/sso.conf changes (team groups, addresses, bind account, CA) to a running
# installation: Keycloak imports the realm on its first start only, so the running realm is
# updated through Keycloak's admin API (scripts/kc-apply.mjs), then EPI and Keycloak restart.
cmd_sso_apply() {
  prod_sso_enabled || die "Active Directory sign-in is not set up here (./epi.sh sso-setup first)"
  compose ps --status running keycloak | grep -q keycloak || die "sign-in (Keycloak) is not running: ./epi.sh start"
  cmd_sso_setup >/dev/null
  load_conf "$STATE_DIR/sso.conf"
  info "Updating the running sign-in service"
  compose run --rm --no-deps -T --entrypoint node \
    -v "$ROOT/scripts/kc-apply.mjs:/kc-apply.mjs:ro" -v "$SSO_DIR/epi-realm.json:/realm.json:ro" \
    epi /kc-apply.mjs /realm.json http://keycloak:8080 <"$SSO_DIR/kc_admin_password" ||
    die "could not update Keycloak; nothing else was changed"
  info "Restarting sign-in and EPI with the new settings"
  compose restart keycloak >/dev/null
  compose up -d >/dev/null
  wait_healthy 150 || die "EPI did not become healthy after sso-apply; see ./epi.sh logs"
  echo "Done. Check the team groups with: ./epi.sh cli directory-check"
}

# Creates Keycloak's database and role in the shared PostgreSQL (idempotent).
ensure_keycloak_db() {
  local pwfile
  if prod_sso_enabled; then pwfile="$SSO_DIR/kc_db_password"
  elif local_sso_enabled; then pwfile="$LOCAL_DIR/kc_db_password"
  else return 0; fi
  compose up -d --wait postgres >/dev/null
  { printf "\\set pw '%s'\n" "$(cat "$pwfile")"
    cat <<'SQL'
SELECT 'CREATE ROLE keycloak LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak')\gexec
ALTER ROLE keycloak WITH LOGIN PASSWORD :'pw';
SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
SQL
  } | compose exec -T postgres psql -q -U epi -d postgres -v ON_ERROR_STOP=1 >/dev/null
}

# Loads the images of an extracted bundle and checks each one's identity against the manifest.
load_bundle_images() {
  local dir="$1" tag file manifest_id config_id id
  while IFS=$'\t' read -r tag file manifest_id config_id; do
    info "Loading $tag"
    docker load -q -i "$dir/$file" >/dev/null || die "docker load failed for $file"
    id="$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null)" || die "$tag missing after load"
    [ "$id" = "$manifest_id" ] || [ "$id" = "$config_id" ] || die "$tag has unexpected identity $id"
    rm -f "$dir/$file"
  done <"$dir/images/manifest.tsv"
}

# Verifies a bundle file (outer .sha256 when present, inner SHA256SUMS) and extracts it to $2.
extract_bundle() {
  local bundle="$1" dest="$2"
  if [ -f "$bundle.sha256" ]; then
    info "Verifying bundle checksum"
    (cd "$(dirname "$bundle")" && sha256sum -c --quiet "$(basename "$bundle").sha256") || die "bundle checksum mismatch — copy it again"
  else
    warn "no $bundle.sha256 next to the bundle; checking the contents' checksums only"
  fi
  mkdir -p "$dest"
  tar -xf "$bundle" -C "$dest" --strip-components=1 --no-same-owner
  (cd "$dest" && sha256sum -c --quiet SHA256SUMS) || die "bundle contents are corrupt (SHA256SUMS mismatch)"
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
  [ ! -e "$dir/epi.sh" ] || die "$dir already contains an installation — use ./epi.sh upgrade <bundle> there"
  info "Extracting to $dir"
  extract_bundle "$bundle" "$dir"
  load_bundle_images "$dir"
  printf '\n%sEPI %s installed in %s%s (images loaded and verified; nothing was downloaded).\n' "$G" "$(sed -n 's/^EPI_VERSION=//p' "$dir/deploy/offline.env")" "$dir" "$N"
  printf 'Next:\n  cd %s && ./epi.sh doctor\n  ./epi.sh demo    # synthetic demo\nProduction (your Keycloak): see docs/OFFLINE_INSTALL.md\n' "$dir"
}

# Local sign-in realm (no AD) for `up`: host node, or node inside the EPI image.
gen_local_realm() {
  local url="http://127.0.0.1:$EPI_PORT"
  mkdir -p "$LOCAL_DIR" && chmod 700 "$LOCAL_DIR"
  if command -v node >/dev/null; then
    node "$ROOT/scripts/kc-local-realm.mjs" "$LOCAL_DIR" "$url" "$1" "$2"
  else
    docker run --rm --network none --entrypoint node -u "$(id -u):$(id -g)" \
      -v "$ROOT/scripts/kc-local-realm.mjs:/realm.mjs:ro" -v "$LOCAL_DIR:/out" \
      "$EPI_IMAGE" /realm.mjs /out "$url" "$1" "$2"
  fi
}

# Who becomes the first administrator: asked once, kept in .epi/admin.conf (not secret).
ask_admin() {
  local conf="$STATE_DIR/admin.conf"
  if [ -f "$conf" ]; then load_conf "$conf"; return; fi
  if [ -z "${EPI_ADMIN_NAME:-}" ] || [ -z "${EPI_ADMIN_EMAIL:-}" ] || [ -z "${EPI_ORG_NAME:-}" ]; then
    [ -t 0 ] || die "first start: set EPI_ADMIN_NAME, EPI_ADMIN_EMAIL and EPI_ORG_NAME (you become the administrator)"
    printf '%sFirst start: you will be the administrator.%s\n' "$B" "$N"
    [ -n "${EPI_ADMIN_NAME:-}" ] || read -r -p "  Your full name: " EPI_ADMIN_NAME
    [ -n "${EPI_ADMIN_EMAIL:-}" ] || read -r -p "  Your work e-mail${1:+ (as in Active Directory)}: " EPI_ADMIN_EMAIL
    [ -n "${EPI_ORG_NAME:-}" ] || read -r -p "  Organization name: " EPI_ORG_NAME
  fi
  [[ "$EPI_ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "not a valid e-mail: $EPI_ADMIN_EMAIL"
  [ -n "${EPI_ADMIN_NAME// /}" ] && [ -n "${EPI_ORG_NAME// /}" ] || die "name and organization are required"
  printf 'EPI_ADMIN_NAME=%s\nEPI_ADMIN_EMAIL=%s\nEPI_ORG_NAME=%s\n' "$EPI_ADMIN_NAME" "$EPI_ADMIN_EMAIL" "$EPI_ORG_NAME" >"$conf"
  export EPI_ADMIN_NAME EPI_ADMIN_EMAIL EPI_ORG_NAME
}

# The real app in one command: builds if needed, starts in production mode with an empty database
# and real sign-in (Active Directory when .epi/sso.conf exists, otherwise local accounts on this
# computer), makes you the administrator and opens nothing to the network.
cmd_up() {
  [ -z "${EPI_OIDC_CLIENT_SECRET_PATH:-}" ] || die "with an external Keycloak (EPI_OIDC_CLIENT_SECRET_PATH) use ./epi.sh start"
  cmd_doctor || die "doctor reported failures; fix them and retry"
  ensure_state
  printf 'real\n' >"$STATE_DIR/run-mode"; RUN_MODE=real
  ensure_image
  local ad=""
  if [ -f "$STATE_DIR/sso.conf" ]; then
    ad=1
    [ -f "$SSO_DIR/epi-realm.json" ] || cmd_sso_setup
    load_conf "$STATE_DIR/sso.conf"
    ask_admin ad
  else
    case "$EPI_BIND" in 127.0.0.1 | localhost) ;; *) die "without Active Directory, EPI stays on this computer: unset EPI_BIND" ;; esac
    ask_admin
    [ -f "$LOCAL_DIR/epi-local-realm.json" ] || gen_local_realm "$EPI_ADMIN_NAME" "$EPI_ADMIN_EMAIL"
  fi
  ensure_keycloak_db
  info "Starting EPI (production mode, real data only)"
  compose up -d
  info "Waiting for EPI and its sign-in service (first start takes about a minute)"
  if ! wait_healthy 150; then
    compose logs --tail 50 epi keycloak >&2
    die "EPI did not become healthy; see logs above"
  fi
  local admin
  admin="$(compose exec -T epi node dist/cli.js setup-admin --name "$EPI_ADMIN_NAME" \
    --email "$EPI_ADMIN_EMAIL" --org "$EPI_ORG_NAME")" || die "setup-admin failed: $admin"
  printf '%s\n' "${admin%%$'\n'*}"
  local url="http://127.0.0.1:$EPI_PORT"
  [ -z "$ad" ] || url="${EPI_PUBLIC_URL:-$url}"
  printf '\n%sEPI is running:%s %s\n' "$G" "$N" "$url"
  if [ -n "$ad" ]; then
    printf 'Sign in with your Active Directory account (%s).\n' "$EPI_ADMIN_EMAIL"
  elif [ -f "$LOCAL_DIR/first-sign-in.txt" ]; then
    cat "$LOCAL_DIR/first-sign-in.txt"
    printf 'Shown again with: ./epi.sh credentials   Stop: ./epi.sh stop   Start again: ./epi.sh up\n'
  fi
  printf 'Next, in Administration: Organization (groups, teams) → People → Settings (Jira, GitLab).\n'
}

cmd_demo() {
  RUN_MODE=demo
  cmd_doctor || die "doctor reported failures; fix them and retry"
  ensure_image
  ensure_state
  printf 'demo\n' >"$STATE_DIR/run-mode"
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

# Restores Keycloak's database as its own role, so Keycloak still owns (and can migrate) its tables.
restore_keycloak_db() {
  { echo 'SET ROLE keycloak;'; gunzip -c "$1"; } |
    compose exec -T postgres psql -U epi -d keycloak -v ON_ERROR_STOP=1 -q >/dev/null
}

has_keycloak_db() {
  [ "$(compose exec -T postgres psql -U epi -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'keycloak'" 2>/dev/null | tr -d '[:space:]')" = 1 ]
}

# Writes backups/epi-<UTC time>.sql.gz and, when sign-in runs here (AD or local accounts),
# backups/keycloak-<same time>.sql.gz: sign-in settings and local accounts are restored with the data.
cmd_backup() {
  ensure_state
  compose ps --status running postgres | grep -q postgres || die "postgres is not running (./epi.sh start)"
  mkdir -p "$ROOT/backups"
  local stamp file kc
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$ROOT/backups/epi-$stamp.sql.gz"
  (umask 077 && compose exec -T postgres pg_dump -U epi -d epi --clean --if-exists --no-owner | gzip >"$file")
  [ -s "$file" ] || die "backup is empty"
  gzip -t "$file" || die "backup is corrupt"
  printf 'Backup written: %s (%s)\n' "$file" "$(du -h "$file" | cut -f1)"
  BACKUP_FILE="$file" KC_BACKUP_FILE=""
  if has_keycloak_db; then
    kc="$ROOT/backups/keycloak-$stamp.sql.gz"
    (umask 077 && compose exec -T postgres pg_dump -U epi -d keycloak --clean --if-exists --no-owner | gzip >"$kc")
    gzip -t "$kc" || die "sign-in (Keycloak) backup is corrupt"
    printf 'Sign-in backup written: %s (%s)\n' "$kc" "$(du -h "$kc" | cut -f1)"
    KC_BACKUP_FILE="$kc"
  fi
}

cmd_restore() {
  local file="${1:-}" yes="${2:-}" kc
  [ -n "$file" ] && [ -f "$file" ] || die "usage: ./epi.sh restore <backup.sql.gz> [--yes]"
  gzip -t "$file" || die "not a valid gzip backup: $file"
  # The sign-in backup taken at the same time, if any (backups/keycloak-<time>.sql.gz).
  kc="$(dirname "$file")/keycloak-$(basename "$file" | sed 's/^epi-//')"
  [ "$(basename "$file")" != "$(basename "$kc")" ] && [ -f "$kc" ] || kc=""
  if [ -n "$kc" ]; then gzip -t "$kc" || die "not a valid gzip backup: $kc"; fi
  if [ "$yes" != "--yes" ]; then
    printf '%sThis REPLACES all EPI data%s with %s.%s Type "restore" to continue: ' "$Y" "${kc:+ and sign-in accounts}" "$file" "$N"
    read -r answer
    [ "$answer" = "restore" ] || die "aborted"
  fi
  compose stop epi >/dev/null
  gunzip -c "$file" | compose exec -T postgres psql -U epi -d epi -v ON_ERROR_STOP=1 -q >/dev/null
  if [ -n "$kc" ] && has_keycloak_db; then
    compose stop keycloak >/dev/null 2>&1 || true
    restore_keycloak_db "$kc"
    echo "Sign-in (Keycloak) restored from $kc"
  fi
  compose up -d >/dev/null 2>&1
  wait_healthy 150 && echo "Restore complete; EPI healthy." || die "EPI unhealthy after restore"
}

# Installation files replaced by an upgrade (state in .epi/ and backups/ are never touched).
UPGRADE_ITEMS=(epi.sh LICENSE NOTICE THIRD_PARTY_LICENSES.md SHA256SUMS deploy scripts docs)

swap_files() { # <from-dir> <to-dir>
  local item
  for item in "${UPGRADE_ITEMS[@]}"; do
    rm -rf "${2:?}/$item"
    [ ! -e "$1/$item" ] || cp -a "$1/$item" "$2/$item"
  done
}

# Upgrade an installation made from a bundle (EPI-012c, ADR-031): verify → back up → load images →
# replace files → start (migrations run on start) → health check; on failure put the previous
# files back, restore the backup and start the previous version again.
cmd_upgrade() {
  local bundle="" yes=""
  while [ $# -gt 0 ]; do
    case "$1" in --yes) yes=1; shift ;; *) bundle="$1"; shift ;; esac
  done
  [ -n "$bundle" ] && [ -f "$bundle" ] || die "usage: ./epi.sh upgrade <epi-bundle-….tar> [--yes]"
  [ -n "${EPI_OFFLINE:-}" ] || die "upgrade is for installations made from a bundle; in a source checkout: git pull && ./epi.sh build && ./epi.sh start"
  bundle="$(cd "$(dirname "$bundle")" && pwd)/$(basename "$bundle")"
  if [ -z "${EPI_UPGRADE_ROOT:-}" ]; then
    local self; self="$(mktemp)"; cp "$ROOT/epi.sh" "$self"
    EPI_UPGRADE_ROOT="$ROOT" exec bash "$self" upgrade "$bundle" ${yes:+--yes}
  fi
  # shellcheck disable=SC2064 # expand now: remove this temporary copy of the script on exit
  trap "rm -f '${BASH_SOURCE[0]}'" EXIT
  docker info >/dev/null 2>&1 || die "docker daemon not reachable"
  wait_healthy 1 || die "EPI is not running healthy — start it first (./epi.sh start); the upgrade backs up the live database"

  local work="$STATE_DIR/upgrade" new current="${EPI_VERSION:-unknown}" target
  rm -rf "$work"; mkdir -p "$work"; chmod 700 "$work"
  new="$work/new"
  info "Checking the bundle"
  extract_bundle "$bundle" "$new"
  target="$(sed -n 's/^EPI_VERSION=//p' "$new/deploy/offline.env")"
  [ -n "$target" ] || die "the bundle has no EPI_VERSION"
  [ "$target" != "$current" ] || die "EPI $current is already installed"
  local cur_base="${current%%-*}" new_base="${target%%-*}"
  if [ "$cur_base" != "$new_base" ] && [ "$(printf '%s\n%s\n' "$cur_base" "$new_base" | sort -V | head -1)" = "$new_base" ]; then
    die "the bundle ($target) is older than the installed EPI ($current); downgrades are not supported — restore a backup instead"
  fi
  if [ -z "$yes" ]; then
    printf 'Upgrade EPI %s → %s? A backup is taken first; on failure EPI rolls back. Type "upgrade" to continue: ' "$current" "$target"
    read -r answer
    [ "$answer" = "upgrade" ] || die "aborted"
  fi

  info "Backing up the database"
  cmd_backup
  local db_backup="$BACKUP_FILE" kc_backup="$KC_BACKUP_FILE"

  load_bundle_images "$new"
  info "Installing EPI $target files (previous files kept in $work/previous)"
  mkdir -p "$work/previous"
  swap_files "$ROOT" "$work/previous"
  swap_files "$new" "$ROOT"

  info "Starting EPI $target (database migrations run on start)"
  if bash "$ROOT/epi.sh" start --no-wait >"$work/start.log" 2>&1 && wait_healthy "${EPI_UPGRADE_HEALTH_TRIES:-90}"; then
    printf '\n%sEPI upgraded: %s → %s.%s Backup: %s\n' "$G" "$current" "$target" "$N" "$db_backup"
    printf 'The previous version'"'"'s images stay loaded; remove them with docker image prune when satisfied.\n'
    rm -rf "$new"
    return 0
  fi

  printf '%sEPI %s did not become healthy — rolling back to %s.%s\n' "$R" "$target" "$current" "$N" >&2
  compose logs --no-color --tail 300 epi >"$work/failed-version.log" 2>&1 || true
  compose stop epi >/dev/null 2>&1 || true
  swap_files "$work/previous" "$ROOT"
  # Reload the previous version's settings (image tags) before using Compose again.
  set -a; . "$ROOT/deploy/offline.env"; set +a
  info "Restoring the database from $db_backup"
  # Fresh schema first: objects the failed version created are not in the dump and must go too.
  { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; gunzip -c "$db_backup"; } |
    compose exec -T postgres psql -U epi -d epi -v ON_ERROR_STOP=1 -q >/dev/null
  if [ -n "$kc_backup" ]; then
    compose stop keycloak >/dev/null 2>&1 || true
    restore_keycloak_db "$kc_backup"
  fi
  compose up -d >/dev/null 2>&1
  if wait_healthy; then
    die "upgrade to $target failed and was rolled back: EPI $current is running with the data from before the upgrade. Logs of the failed version: $work/failed-version.log"
  fi
  die "upgrade to $target failed AND the rollback did not become healthy. Data backup: $db_backup. Logs: $work/failed-version.log"
}

not_yet() {
  printf '%s: not implemented yet (%s). Use ./epi.sh demo for now.\n' "$1" "$2" >&2
  exit 2
}

case "${1:-help}" in
  doctor) cmd_doctor ;;
  build) cmd_build ;;
  demo) cmd_demo ;;
  up) cmd_up ;;
  start)
    ensure_state
    ensure_keycloak_db
    if [ "${2:-}" = "--no-wait" ]; then compose up -d; exit 0; fi
    compose up -d; wait_healthy && echo "EPI is up on http://$EPI_BIND:$EPI_PORT" ;;
  stop) compose stop ;;
  status) cmd_status ;;
  logs) compose logs -f epi ;;
  sso-setup) cmd_sso_setup ;;
  sso-apply) cmd_sso_apply ;;
  source-token) shift; cmd_source_token "$@" ;;
  source-ca) shift; cmd_source_ca "$@" ;;
  cli)
    # EPI's server commands (node dist/cli.js) inside the running app container, e.g. setup-admin.
    shift
    if [ -t 0 ]; then compose exec epi node dist/cli.js "$@"; else compose exec -T epi node dist/cli.js "$@"; fi ;;
  credentials)
    if [ "$RUN_MODE" = real ] && [ -f "$LOCAL_DIR/first-sign-in.txt" ]; then cat "$LOCAL_DIR/first-sign-in.txt"; exit 0; fi
    [ -f "$KC_DIR/demo-credentials.txt" ] || die "no demo credentials yet — run ./epi.sh demo"
    cat "$KC_DIR/demo-credentials.txt" ;;
  test) shift; bash "$ROOT/scripts/ci.sh" "$@" ;;
  backup) cmd_backup ;;
  restore) shift; cmd_restore "$@" ;;
  install) not_yet install "production config + Keycloak, backlog EPI-003/EPI-012" ;;
  upgrade) shift; cmd_upgrade "$@" ;;
  offline-install) shift; cmd_offline_install "$@" ;;
  bundle)
    [ -z "${EPI_OFFLINE:-}" ] || die "bundles are built from the source repository, not an installation"
    shift; bash "$ROOT/scripts/bundle.sh" "$@" ;;
  help | -h | --help) usage ;;
  *) usage; exit 64 ;;
esac
