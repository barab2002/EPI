#!/usr/bin/env bash
# Builds a SYNTHETIC test directory for SSO tests (EPI-003b): test CA + LDAPS server certificate,
# users/groups LDIF with random passwords. Output dir layout:
#   certs/{ca.crt,ldap.crt,ldap.key,dhparam.pem}  ldif/50-pilot.ldif  passwords.env (0600)
# The read-only bind account is the image's built-in read-only user (cn=svc-epi-read,dc=corp,…),
# created from LDAP_PW_SVC by scripts/dev/ldap-run.sh.
# Users (match the demo seed by e-mail): taylor + eli in Team-Payments, gal in Team-Platform,
# outsider only in a non-team group. (AD nested groups are covered by the realm unit tests.) Usage: scripts/dev/ldap-fixture.sh <outDir>
set -euo pipefail
out="${1:?usage: ldap-fixture.sh <outDir>}"
mkdir -p "$out/certs" "$out/ldif"; chmod 700 "$out"
c="$out/certs"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$c/ca.key" -out "$c/ca.crt" -days 2 \
  -subj "/CN=EPI TEST CA (synthetic)" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout "$c/ldap.key" -out "$c/ldap.csr" -subj "/CN=ldap" 2>/dev/null
printf 'subjectAltName=DNS:ldap,DNS:localhost,IP:127.0.0.1\n' >"$c/ext.cnf"
openssl x509 -req -in "$c/ldap.csr" -CA "$c/ca.crt" -CAkey "$c/ca.key" -CAcreateserial \
  -out "$c/ldap.crt" -days 2 -extfile "$c/ext.cnf" 2>/dev/null
# RFC 7919 ffdhe2048 (public, fixed): instant, and accepted by GnuTLS unlike -dsaparam output.
openssl genpkey -genparam -algorithm DH -pkeyopt group:ffdhe2048 -out "$c/dhparam.pem" 2>/dev/null
rm -f "$c/ldap.csr" "$c/ext.cnf" "$c/ca.srl" "$c/ca.key"
chmod 644 "$c"/*

pw() { openssl rand -hex 10; }
ssha() { # RFC 2307 {SSHA} hash of $1 (test directory only)
  python3 -c 'import base64,hashlib,os,sys; s=os.urandom(4); print("{SSHA}"+base64.b64encode(hashlib.sha1(sys.argv[1].encode()+s).digest()+s).decode())' "$1"
}
declare -A P=([taylor]=$(pw) [eli]=$(pw) [gal]=$(pw) [outsider]=$(pw) [svc]=$(pw))
user() { # uid, given, sn
  cat <<LDIF
dn: uid=$1,ou=Users,dc=corp,dc=example
objectClass: inetOrgPerson
uid: $1
cn: $2 $3
givenName: $2
sn: $3
mail: $(echo "$2.$3" | tr 'A-Z' 'a-z')@example.invalid
userPassword: $(ssha "${P[$1]}")

LDIF
}
{
  printf 'dn: ou=Users,dc=corp,dc=example\nobjectClass: organizationalUnit\nou: Users\n\n'
  printf 'dn: ou=Groups,dc=corp,dc=example\nobjectClass: organizationalUnit\nou: Groups\n\n'
  user taylor Taylor Lead
  user eli Eli Engineer
  user gal Gal Groupman
  user outsider Olive Outsider
  cat <<LDIF
dn: cn=Team-Payments,ou=Groups,dc=corp,dc=example
objectClass: groupOfNames
cn: Team-Payments
member: uid=taylor,ou=Users,dc=corp,dc=example
member: uid=eli,ou=Users,dc=corp,dc=example

dn: cn=Team-Platform,ou=Groups,dc=corp,dc=example
objectClass: groupOfNames
cn: Team-Platform
member: uid=gal,ou=Users,dc=corp,dc=example

dn: cn=Not-A-Team,ou=Groups,dc=corp,dc=example
objectClass: groupOfNames
cn: Not-A-Team
member: uid=outsider,ou=Users,dc=corp,dc=example
LDIF
} >"$out/ldif/50-pilot.ldif"
(umask 077; for k in "${!P[@]}"; do echo "LDAP_PW_${k^^}=${P[$k]}"; done >"$out/passwords.env")
echo "ldap fixture ready in $out"
