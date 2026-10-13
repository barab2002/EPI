# Offline installation (air-gapped hosts)

EPI installs and runs without internet access. A **bundle** built on a connected machine carries
everything the target host needs: the EPI image, the pinned PostgreSQL image (and the demo
Keycloak image), Compose files, `epi.sh`, licenses and checksums.

## 1. Build the bundle (connected machine with the source repository)

```bash
./epi.sh bundle                 # dist/epi-bundle-<version>-<arch>.tar + .sha256
./epi.sh bundle --no-keycloak   # smaller: production with your own Keycloak, no demo SSO
```

Requirements: Node 22 + pnpm 10, Docker 24+ with Compose v2. Third-party images are taken from
`deploy/images.lock` (pinned by digest); the bundle is for the builder's CPU architecture
(`linux/amd64` or `linux/arm64`). Copy **both** files (`.tar` and `.tar.sha256`) to the target.

## 2. Install on the target host (no internet)

Prerequisites: Linux, Docker 24+ with the Compose v2 plugin, 2 CPU, 4 GB RAM, 5 GB disk.
No Node, pnpm or registry access is needed.

```bash
tar -xOf epi-bundle-<version>-<arch>.tar --wildcards '*/epi.sh' > epi.sh && chmod +x epi.sh
./epi.sh offline-install epi-bundle-<version>-<arch>.tar --dir /opt/epi
cd /opt/epi && ./epi.sh doctor
```

`offline-install` verifies the bundle checksum and every file in it (`SHA256SUMS`), loads the
images, checks each loaded image's identity against the bundle manifest, and writes nothing
outside `--dir` except Docker images. It does not start anything. The installation always uses
the bundled images (`deploy/offline.env`, Compose `pull_policy: never`), so it never tries to
reach a registry.

**Integrity:** the `.sha256` file protects against corruption in transit; it is only as trustworthy
as the channel it came through. Compare it with the value published by the bundle's builder (e.g.
read it over the phone or from a signed ticket). Cryptographic signing of bundles is planned.

## 3. Run

- **Synthetic demo:** `./epi.sh demo` — demo data and, unless built with `--no-keycloak`, the
  demo Keycloak with generated users (`./epi.sh credentials`). The realm generator runs inside
  the EPI image when the host has no Node.
- **Production:** sign-in with Active Directory through the bundled Keycloak — `docs/KEYCLOAK.md`
  section A (`./epi.sh sso-setup`, then `./epi.sh start`). Build the bundle **with** Keycloak (no
  `--no-keycloak`). An existing corporate Keycloak is the alternative (section 1).
  Internal CAs: set `NODE_EXTRA_CA_CERTS`. Exposing EPI beyond localhost (`EPI_BIND`) needs TLS
  in front and approval.
- Operations: `status`, `logs`, `stop`, `backup`, `restore` work as in any installation.

## Verification

`scripts/test-offline-install.sh` builds a bundle, removes the bundle's image tags, installs into
a temporary directory and starts the stack on a Compose network marked `internal: true` (no route
outside Docker), then waits for both containers to report healthy. See `docs/TEST_STATUS.md`.
Limitation: the test runs on the build host, so image layers may already exist locally; a run on
a separate clean VM without network is still recommended before the pilot.

## Not yet

`upgrade` (in-place version change with backup and migration check) and an SBOM/vulnerability
report (needs an approved scanner) are planned (EPI-012b).
