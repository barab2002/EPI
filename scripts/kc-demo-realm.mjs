// Generates the DEMO Keycloak realm for `./epi.sh demo`: realm `epi-demo`, confidential client
// `epi-web`, and one sign-in user per demo role. Passwords and the client secret are random per
// install and written only under .epi/keycloak/ (gitignored, directory mode 0700).
// Usage: node scripts/kc-demo-realm.mjs <outDir> <epiPublicUrl>
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, publicUrl] = process.argv.slice(2);
if (!outDir || !publicUrl) {
  console.error('usage: node scripts/kc-demo-realm.mjs <outDir> <epiPublicUrl>');
  process.exit(64);
}
if (existsSync(join(outDir, 'epi-demo-realm.json'))) {
  console.log('demo realm already generated; keeping existing credentials');
  process.exit(0);
}

// Must match synthetic people in apps/api/src/seed/demo-seed.ts (linked by verified e-mail).
const USERS = [
  ['morgan', 'Morgan Example', 'Engineering manager (whole org)'],
  ['gal', 'Gal Groupman', 'Group manager (Platform)'],
  ['taylor', 'Taylor Lead', 'Team lead (Payments)'],
  ['eli', 'Eli Engineer', 'Developer (Payments)'],
  ['jo', 'Jo Small', 'Developer in a 3-person team'],
  ['avery', 'Avery Admin', 'Administrator (structure only)'],
];
const email = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.invalid`;
// 4 groups of 4 from an unambiguous alphabet, e.g. "k7mp-3xqa-..." — easy to type.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const password = () =>
  Array.from({ length: 4 }, () =>
    Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join(''),
  ).join('-');

mkdirSync(outDir, { recursive: true, mode: 0o700 });
chmodSync(outDir, 0o700);
const clientSecret = randomBytes(24).toString('base64url');
const adminPassword = password();
const users = USERS.map(([username, name, role]) => ({
  username,
  name,
  role,
  password: password(),
}));

const realm = {
  realm: 'epi-demo',
  displayName: 'EPI demo (synthetic users)',
  enabled: true,
  sslRequired: 'external',
  loginWithEmailAllowed: true,
  bruteForceProtected: true,
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
      redirectUris: [`${publicUrl}/api/v1/auth/callback`],
      webOrigins: [],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': `${publicUrl}/*`,
      },
    },
  ],
  users: users.map((u) => {
    const [first, ...rest] = u.name.split(' ');
    return {
      username: u.username,
      email: email(u.name),
      emailVerified: true,
      enabled: true,
      firstName: first,
      lastName: rest.join(' '),
      credentials: [{ type: 'password', value: u.password, temporary: false }],
    };
  }),
};

// Files are 0644 so the non-root containers can read them; the 0700 directory protects them on
// the host (same approach as the database password, see epi.sh ensure_state).
const write = (name, content) => {
  writeFileSync(join(outDir, name), content);
  chmodSync(join(outDir, name), 0o644);
};
write('epi-demo-realm.json', JSON.stringify(realm, null, 2));
write('client_secret', clientSecret);
write(
  'admin.env',
  `KC_BOOTSTRAP_ADMIN_USERNAME=admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}\n`,
);
const lines = [
  'EPI demo sign-in (synthetic people; generated for this install only)',
  '',
  ...users.map((u) => `  ${u.username.padEnd(8)} ${u.password}   ${u.name} — ${u.role}`),
  '',
  `Keycloak admin console: user "admin", password ${adminPassword}`,
];
writeFileSync(join(outDir, 'demo-credentials.txt'), lines.join('\n') + '\n', { mode: 0o600 });
console.log('demo realm generated');
