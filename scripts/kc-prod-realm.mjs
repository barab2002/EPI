// Generates the PRODUCTION Keycloak realm `epi` (EPI-003b, ADR-024): confidential client `epi-web`
// and a READ-ONLY LDAP/AD user federation limited to the pilot team groups. No local users and no
// passwords: people sign in with their directory password, which Keycloak checks against AD over
// LDAPS and never stores. The bind password is referenced from Keycloak's file vault, never inlined.
//
// Usage: node scripts/kc-prod-realm.mjs <sso.conf> <outDir>
//   sso.conf: KEY=VALUE lines (non-secret), see deploy/sso.conf.example
//   outDir:   receives epi-realm.json and client_secret (kept if they already exist)
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VAULT_BIND_KEY = 'ldapbind'; // file vault: <outDir>/vault/epi_ldapbind

const REQUIRED = [
  'EPI_PUBLIC_URL',
  'EPI_LDAP_URL',
  'EPI_LDAP_USERS_DN',
  'EPI_LDAP_BIND_DN',
  'EPI_LDAP_GROUPS_DN',
  'EPI_LDAP_TEAM_GROUPS',
];

/** Parses KEY=VALUE lines; ignores blanks and # comments; values may be single/double quoted. */
export function parseConf(text) {
  const conf = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) throw new Error(`sso.conf: cannot parse line: ${line}`);
    conf[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return conf;
}

/** RFC 4515 filter value escaping. */
export function escapeFilter(v) {
  return v.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

const firstRdnValue = (dn) => /^[^=]+=((?:\\.|[^,\\])+)/.exec(dn)?.[1].replace(/\\(.)/g, '$1');

export function validate(conf) {
  const missing = REQUIRED.filter((k) => !conf[k]);
  if (missing.length) throw new Error(`sso.conf: missing ${missing.join(', ')}`);
  if (!/^https:\/\//.test(conf.EPI_PUBLIC_URL) && conf.EPI_SSO_ALLOW_HTTP !== 'true')
    throw new Error('sso.conf: EPI_PUBLIC_URL must be https://');
  if (!/^ldaps:\/\//.test(conf.EPI_LDAP_URL) && conf.EPI_LDAP_ALLOW_PLAIN !== 'true')
    throw new Error('sso.conf: EPI_LDAP_URL must be ldaps:// (passwords cross the network)');
  const vendor = conf.EPI_LDAP_VENDOR ?? 'ad';
  if (!['ad', 'other'].includes(vendor))
    throw new Error('sso.conf: EPI_LDAP_VENDOR must be ad or other');
  const groups = teamGroups(conf);
  if (groups.length === 0) throw new Error('sso.conf: EPI_LDAP_TEAM_GROUPS is empty');
  for (const g of groups) if (!firstRdnValue(g)) throw new Error(`sso.conf: not a DN: ${g}`);
}

const teamGroups = (conf) =>
  conf.EPI_LDAP_TEAM_GROUPS.split(';')
    .map((s) => s.trim())
    .filter(Boolean);

/** Directory dialect: Active Directory or a generic LDAP (OpenLDAP with the memberOf overlay). */
function dialect(vendor) {
  return vendor === 'ad'
    ? {
        username: 'sAMAccountName',
        rdn: 'cn',
        uuid: 'objectGUID',
        userClasses: 'person, organizationalPerson, user',
        groupClass: 'group',
        // Matching rule IN_CHAIN: include members of nested groups.
        memberOf: (dn) => `(memberOf:1.2.840.113556.1.4.1941:=${escapeFilter(dn)})`,
        // Exclude disabled AD accounts (userAccountControl bit 2).
        extra: '(!(userAccountControl:1.2.840.113556.1.4.803:=2))',
      }
    : {
        username: 'uid',
        rdn: 'uid',
        uuid: 'entryUUID',
        userClasses: 'inetOrgPerson, organizationalPerson',
        groupClass: 'groupOfNames',
        memberOf: (dn) => `(memberOf=${escapeFilter(dn)})`,
        extra: '',
      };
}

const cfg = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [String(v)]]));
const attrMapper = (name, ldap, model, mandatory = false) => ({
  name,
  providerId: 'user-attribute-ldap-mapper',
  config: cfg({
    'ldap.attribute': ldap,
    'user.model.attribute': model,
    'read.only': true,
    'always.read.value.from.ldap': true,
    'is.mandatory.in.ldap': mandatory,
  }),
});

/** Builds the realm representation (pure; no I/O). */
export function buildRealm(conf, clientSecret) {
  validate(conf);
  const vendor = conf.EPI_LDAP_VENDOR ?? 'ad';
  const d = dialect(vendor);
  const groups = teamGroups(conf);
  const publicUrl = conf.EPI_PUBLIC_URL.replace(/\/+$/, '');
  const userFilter = `(&(|${groups.map(d.memberOf).join('')})${d.extra})`;
  const groupFilter = `(|${groups.map((g) => `(cn=${escapeFilter(firstRdnValue(g))})`).join('')})`;
  return {
    realm: 'epi',
    displayName: 'EPI',
    enabled: true,
    sslRequired: conf.EPI_SSO_ALLOW_HTTP === 'true' ? 'external' : 'all',
    registrationAllowed: false,
    resetPasswordAllowed: false, // passwords are managed in AD
    rememberMe: false,
    loginWithEmailAllowed: false,
    editUsernameAllowed: false,
    bruteForceProtected: true,
    failureFactor: 10,
    ssoSessionIdleTimeout: 1800,
    clients: [
      {
        clientId: 'epi-web',
        name: 'EPI',
        protocol: 'openid-connect',
        enabled: true,
        publicClient: false,
        secret: clientSecret,
        standardFlowEnabled: true,
        directAccessGrantsEnabled: false,
        implicitFlowEnabled: false,
        serviceAccountsEnabled: false,
        redirectUris: [`${publicUrl}/api/v1/auth/callback`],
        webOrigins: [],
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': `${publicUrl}/*`,
        },
      },
    ],
    components: {
      'org.keycloak.storage.UserStorageProvider': [
        {
          name: 'directory',
          providerId: 'ldap',
          config: cfg({
            enabled: true,
            priority: 0,
            vendor: vendor === 'ad' ? 'ad' : 'other',
            editMode: 'READ_ONLY',
            importEnabled: true,
            syncRegistrations: false,
            trustEmail: true,
            connectionUrl: conf.EPI_LDAP_URL,
            useTruststoreSpi: 'always',
            startTls: false,
            authType: 'simple',
            bindDn: conf.EPI_LDAP_BIND_DN,
            bindCredential: `\${vault.${VAULT_BIND_KEY}}`,
            usersDn: conf.EPI_LDAP_USERS_DN,
            searchScope: 2,
            usernameLDAPAttribute: d.username,
            rdnLDAPAttribute: d.rdn,
            uuidLDAPAttribute: d.uuid,
            userObjectClasses: d.userClasses,
            customUserSearchFilter: userFilter,
            pagination: true,
            connectionPooling: true,
            connectionTimeout: 10000,
            readTimeout: 30000,
            fullSyncPeriod: -1,
            changedSyncPeriod: -1,
            cachePolicy: 'DEFAULT',
            validatePasswordPolicy: false,
            allowKerberosAuthentication: false,
          }),
          subComponents: {
            'org.keycloak.storage.ldap.mappers.LDAPStorageMapper': [
              attrMapper('username', d.username, 'username', true),
              attrMapper('email', 'mail', 'email'),
              attrMapper('first name', 'givenName', 'firstName'),
              attrMapper('last name', 'sn', 'lastName'),
              {
                name: 'team groups',
                providerId: 'group-ldap-mapper',
                config: cfg({
                  'groups.dn': conf.EPI_LDAP_GROUPS_DN,
                  'group.name.ldap.attribute': 'cn',
                  'group.object.classes': d.groupClass,
                  'preserve.group.inheritance': false,
                  'ignore.missing.groups': true,
                  'membership.ldap.attribute': 'member',
                  'membership.attribute.type': 'DN',
                  'membership.user.ldap.attribute': d.rdn,
                  'groups.ldap.filter': groupFilter,
                  mode: 'READ_ONLY',
                  'user.roles.retrieve.strategy': 'LOAD_GROUPS_BY_MEMBER_ATTRIBUTE',
                  'drop.non.existing.groups.during.sync': true,
                }),
              },
            ],
          },
        },
      ],
    },
  };
}

function main() {
  const [confPath, outDir] = process.argv.slice(2);
  if (!confPath || !outDir) {
    console.error('usage: node scripts/kc-prod-realm.mjs <sso.conf> <outDir>');
    process.exit(64);
  }
  const conf = parseConf(readFileSync(confPath, 'utf8'));
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const secretPath = join(outDir, 'client_secret');
  const clientSecret = existsSync(secretPath)
    ? readFileSync(secretPath, 'utf8').trim()
    : randomBytes(24).toString('base64url');
  const realm = buildRealm(conf, clientSecret);
  // 0644 inside the 0700 directory: readable by the non-root containers only (see epi.sh).
  writeFileSync(join(outDir, 'epi-realm.json'), JSON.stringify(realm, null, 2));
  chmodSync(join(outDir, 'epi-realm.json'), 0o644);
  if (!existsSync(secretPath)) {
    writeFileSync(secretPath, clientSecret);
    chmodSync(secretPath, 0o644);
  }
  console.log(
    `realm epi generated (${teamGroups(conf).length} team group(s), read-only directory)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
