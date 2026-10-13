#!/usr/bin/env bash
# Builds the offline installation bundle (EPI-012): one tarball with the EPI image, the pinned
# PostgreSQL (and demo Keycloak) images, Compose files, epi.sh, licenses and checksums.
#   ./epi.sh bundle [--no-keycloak]     → dist/epi-bundle-<version>-<arch>.tar (+ .sha256)
# --no-keycloak only when an EXTERNAL Keycloak is used: AD sign-in (sso-setup) needs the bundled one.
# Needs network only to pull pinned images not yet present; the target host needs none.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/images.sh"
with_kc=true
[ "${1:-}" = "--no-keycloak" ] && with_kc=false

die() { echo "bundle: $*" >&2; exit 1; }
command -v node >/dev/null || die "node is required to build a bundle"
version="$(node -p "require('$ROOT/apps/api/package.json').version")-$(git -C "$ROOT" rev-parse --short HEAD)"
[ -z "$(git -C "$ROOT" status --porcelain)" ] || version="$version-dirty"
arch="$(docker version -f '{{.Server.Arch}}')"
platform="linux/$arch"
name="epi-bundle-$version-$arch"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
stage="$work/$name"
mkdir -p "$stage/deploy" "$stage/scripts" "$stage/images" "$stage/docs"

echo "==> Building EPI image (version $version)"
EPI_IMAGE="epi:local" bash "$ROOT/epi.sh" build >/dev/null
docker tag epi:local "epi-bundle/epi:$version"

# source ref → bundle tag
refs=("epi-bundle/epi:$version=epi-bundle/epi:$version" "$EPI_POSTGRES_IMAGE=epi-bundle/postgres:16-alpine")
$with_kc && refs+=("$EPI_KEYCLOAK_IMAGE=epi-bundle/keycloak:26.3.3")

: >"$stage/images/manifest.tsv"
for pair in "${refs[@]}"; do
  src="${pair%%=*}" tag="${pair#*=}"
  if [ "$src" != "$tag" ]; then
    docker image inspect "$src" >/dev/null 2>&1 || docker pull -q --platform "$platform" "$src" >/dev/null
    docker tag "$src" "$tag"
  fi
  file="images/$(echo "$tag" | tr '/:' '__').tar"
  echo "==> Saving $tag"
  docker save --platform "$platform" -o "$stage/$file" "$tag"
  # Expected identity after `docker load`: manifest digest (containerd store) or config digest.
  ids="$(node -e '
    const { execFileSync } = require("node:child_process");
    const read = (p) => JSON.parse(execFileSync("tar", ["-xOf", process.argv[1], p], { encoding: "utf8" }));
    const m = read("index.json").manifests.find((x) => !x.annotations?.["io.containerd.manifest.subject"]);
    const cfg = read("manifest.json")[0].Config.replace("blobs/sha256/", "sha256:");
    console.log(`${m.digest}\t${cfg}`);
  ' "$stage/$file")"
  printf '%s\t%s\t%s\n' "$tag" "$file" "$ids" >>"$stage/images/manifest.tsv"
done

echo "==> Adding deployment files"
cp "$ROOT/epi.sh" "$ROOT/LICENSE" "$ROOT/NOTICE" "$stage/"
cp "$ROOT"/deploy/compose*.yaml "$ROOT/deploy/images.lock" "$stage/deploy/"
cp "$ROOT/scripts/images.sh" "$ROOT/scripts/kc-demo-realm.mjs" "$ROOT/scripts/kc-prod-realm.mjs" "$stage/scripts/"
cp "$ROOT/deploy/sso.conf.example" "$stage/deploy/"
cp "$ROOT/docs/OFFLINE_INSTALL.md" "$ROOT/docs/KEYCLOAK.md" "$stage/docs/"
node "$ROOT/scripts/license-report.mjs" --out "$stage/THIRD_PARTY_LICENSES.md" >/dev/null
{
  echo "# Offline bundle $version ($platform). Sourced by epi.sh: use only the bundled images."
  echo "EPI_OFFLINE=1"
  echo "EPI_VERSION=$version"
  echo "EPI_IMAGE=epi-bundle/epi:$version"
  echo "EPI_POSTGRES_IMAGE=epi-bundle/postgres:16-alpine"
  echo "EPI_KEYCLOAK_IMAGE=epi-bundle/keycloak:26.3.3"
  echo "EPI_PULL_POLICY=never"
  $with_kc || echo "EPI_DEMO_SSO=false"
} >"$stage/deploy/offline.env"
(cd "$stage" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)

mkdir -p "$ROOT/dist"
out="$ROOT/dist/$name.tar"
tar -C "$work" -cf "$out" "$name"
(cd "$ROOT/dist" && sha256sum "$name.tar" >"$name.tar.sha256")
echo "Bundle: $out ($(du -h "$out" | cut -f1))"
echo "Install on the target host: ./epi.sh offline-install $name.tar   (see docs/OFFLINE_INSTALL.md)"
