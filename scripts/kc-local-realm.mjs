// Generates the LOCAL sign-in realm for `./epi.sh up` without Active Directory: realm `epi-local`
// with one person (the first administrator) and the confidential client `epi-web`. The password
// is random and temporary (Keycloak asks for a new one at first sign-in); secrets are written only
// under .epi/local/ (gitignored, directory 0700). Keeps an existing realm (same credentials).
// Usage: node scripts/kc-local-realm.mjs <outDir> <epiPublicUrl> <name> <email>
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const REALM = 'epi-local';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const password = () =>
  Array.from({ length: 4 }, () =>
    Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join(''),
  ).join('-');

export function localRealm({ publicUrl, name, email, clientSecret, userPassword }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return {
    realm: REALM,
    displayName: 'EPI',
    enabled: true,
    sslRequired: 'external',
    registrationAllowed: false,
    resetPasswordAllowed: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    bruteForceProtected: true,
    passwordPolicy: 'length(12) and notUsername',
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
    users: [
      {
        username: email,
        email,
        emailVerified: true,
        enabled: true,
        firstName: first,
        lastName: rest.join(' ') || first,
        credentials: [{ type: 'password', value: userPassword, temporary: true }],
        // Realm import ignores `temporary`; this makes Keycloak ask for a new password.
        requiredActions: ['UPDATE_PASSWORD'],
      },
    ],
  };
}

function main() {
  const [outDir, publicUrl, name, rawEmail] = process.argv.slice(2);
  if (!outDir || !publicUrl || !name || !rawEmail) {
    console.error('usage: node scripts/kc-local-realm.mjs <outDir> <epiPublicUrl> <name> <email>');
    process.exit(64);
  }
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`not a valid e-mail: ${rawEmail}`);
    process.exit(65);
  }
  if (existsSync(join(outDir, `${REALM}-realm.json`))) {
    console.log('local sign-in already set up; keeping it');
    return;
  }
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  const clientSecret = randomBytes(24).toString('base64url');
  const userPassword = password();
  // 0644 so the non-root containers can read them; the 0700 directory protects them on the host.
  const write = (file, content, mode = 0o644) => {
    writeFileSync(join(outDir, file), content);
    chmodSync(join(outDir, file), mode);
  };
  write(
    `${REALM}-realm.json`,
    JSON.stringify(localRealm({ publicUrl, name, email, clientSecret, userPassword }), null, 2),
  );
  write('client_secret', clientSecret);
  write('kc_db_password', randomBytes(24).toString('hex'));
  write('kc_admin_password', password());
  write(
    'first-sign-in.txt',
    [
      'EPI first sign-in (this computer only)',
      '',
      `  User:     ${email}`,
      `  Password: ${userPassword}   (one-time: you choose your own at first sign-in)`,
      '',
    ].join('\n'),
    0o600,
  );
  console.log('local sign-in set up');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
