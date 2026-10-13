import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = new URL('./kc-local-realm.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

test('local realm: one administrator with a one-time password, no self-registration', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'epi-local-')), 'local');
  const r = run(out, 'http://127.0.0.1:8080', 'Bar Example', 'Bar.Example@Corp.example');
  assert.equal(r.status, 0, r.stderr);
  const realm = JSON.parse(readFileSync(join(out, 'epi-local-realm.json'), 'utf8'));
  assert.equal(realm.realm, 'epi-local');
  assert.equal(realm.registrationAllowed, false);
  assert.equal(realm.bruteForceProtected, true);
  assert.equal(realm.users.length, 1);
  const [u] = realm.users;
  assert.equal(u.email, 'bar.example@corp.example');
  assert.equal(u.emailVerified, true); // EPI links the person by verified e-mail
  assert.equal(u.credentials[0].temporary, true);
  assert.deepEqual(u.requiredActions, ['UPDATE_PASSWORD']); // new password at first sign-in
  assert.deepEqual(realm.clients[0].redirectUris, ['http://127.0.0.1:8080/api/v1/auth/callback']);
  assert.equal(realm.clients[0].secret, readFileSync(join(out, 'client_secret'), 'utf8'));
  const sheet = readFileSync(join(out, 'first-sign-in.txt'), 'utf8');
  assert.ok(sheet.includes(u.credentials[0].value));
  assert.equal(statSync(join(out, 'first-sign-in.txt')).mode & 0o777, 0o600);
  assert.equal(statSync(out).mode & 0o777, 0o700);

  // A second run keeps the realm and its credentials.
  const before = readFileSync(join(out, 'client_secret'), 'utf8');
  assert.equal(run(out, 'http://127.0.0.1:8080', 'Other', 'other@corp.example').status, 0);
  assert.equal(readFileSync(join(out, 'client_secret'), 'utf8'), before);
});

test('local realm refuses a bad e-mail', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'epi-local-')), 'local');
  const r = run(out, 'http://127.0.0.1:8080', 'X', 'nope');
  assert.equal(r.status, 65);
});
