#!/usr/bin/env bash
# Starts the SYNTHETIC test directory (OpenLDAP, LDAPS on 636) from a fixture made by
# ldap-fixture.sh. Usage: scripts/dev/ldap-run.sh <fixtureDir> <containerName> [docker run args…]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$ROOT/scripts/images.sh"
fx="${1:?fixture dir}" name="${2:?container name}"; shift 2
. "$fx/passwords.env"
docker run -d --name "$name" "$@" \
  -e LDAP_DOMAIN=corp.example -e LDAP_ORGANISATION="EPI test (synthetic)" \
  -e LDAP_ADMIN_PASSWORD="$(openssl rand -hex 16)" \
  -e LDAP_READONLY_USER=true -e LDAP_READONLY_USER_USERNAME=svc-epi-read \
  -e LDAP_READONLY_USER_PASSWORD="$LDAP_PW_SVC" \
  -e LDAP_TLS_CRT_FILENAME=ldap.crt -e LDAP_TLS_KEY_FILENAME=ldap.key \
  -e LDAP_TLS_CA_CRT_FILENAME=ca.crt -e LDAP_TLS_DH_PARAM_FILENAME=dhparam.pem \
  -e LDAP_TLS_VERIFY_CLIENT=never \
  -v "$fx/certs:/container/service/slapd/assets/certs" \
  -v "$fx/ldif:/container/service/slapd/assets/config/bootstrap/ldif/custom" \
  -v "$ROOT/scripts/dev/ldap/03-memberOf.ldif:/container/service/slapd/assets/config/bootstrap/ldif/03-memberOf.ldif:ro" \
  "$EPI_OPENLDAP_TEST_IMAGE" --copy-service >/dev/null
for i in $(seq 1 60); do
  if docker logs "$name" 2>&1 | grep -q 'First start is done'; then
    docker exec -e LDAPTLS_CACERT=/container/service/slapd/assets/certs/ca.crt "$name" \
      ldapwhoami -x -H ldaps://localhost -D "cn=svc-epi-read,dc=corp,dc=example" -w "$LDAP_PW_SVC" >/dev/null 2>&1 && exit 0
  fi
  docker logs "$name" 2>&1 | grep -q 'ERROR' && break
  sleep 2
done
docker logs --tail 20 "$name" >&2
echo "ldap-run: directory did not start" >&2
exit 1
