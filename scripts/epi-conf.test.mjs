import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseConf } from './kc-prod-realm.mjs';

/** Runs epi.sh's load_conf on a file and returns the exported EPI_* variables. */
function loadConf(text) {
  const dir = mkdtempSync(join(tmpdir(), 'epi-conf-'));
  const file = join(dir, 'sso.conf');
  writeFileSync(file, text);
  const fn = readFileSync(new URL('../epi.sh', import.meta.url), 'utf8').match(
    /^load_conf\(\) \{[\s\S]*?^\}$/m,
  )[0];
  const out = execFileSync(
    'bash',
    ['-c', `${fn}\nload_conf "$1"\nenv -0 | grep -z '^EPI_' || true`, 'test', file],
    { env: { PATH: process.env.PATH }, encoding: 'utf8' },
  );
  return Object.fromEntries(
    out
      .split('\0')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

test('epi.sh reads sso.conf literally, exactly like the realm generator', () => {
  const text = [
    '# comment',
    '',
    'EPI_LDAP_BIND_DN=CN=svc-epi-read,OU=Service Accounts,DC=corp,DC=example',
    'EPI_LDAP_TEAM_GROUPS=CN=Team-A,OU=Groups,DC=corp;CN=Team B,OU=Groups,DC=corp',
    'EPI_PUBLIC_URL="https://epi.corp.example"\r',
    "  EPI_SSO_PUBLIC_URL='https://sso.corp.example'  ",
    'EPI_NOTE=$(touch /tmp/epi-should-not-exist) `id` $HOME',
  ].join('\n');
  const got = loadConf(text);
  assert.deepEqual(got, parseConf(text));
  assert.equal(got.EPI_LDAP_TEAM_GROUPS.split(';').length, 2);
  assert.equal(got.EPI_NOTE, '$(touch /tmp/epi-should-not-exist) `id` $HOME');
});

test('epi.sh refuses a line it cannot parse', () => {
  assert.throws(() => loadConf('not a setting\n'), /cannot parse line/);
});
