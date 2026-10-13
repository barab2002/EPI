import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const EPI = new URL('../epi.sh', import.meta.url).pathname;

/** Runs `./epi.sh source-token …` against a temporary state directory. */
function run(state, args, input) {
  return spawnSync('bash', [EPI, 'source-token', ...args], {
    env: { PATH: process.env.PATH, EPI_STATE_DIR: state },
    input,
    encoding: 'utf8',
  });
}

test('source-token stores the token under the reference name, readable by the app only via the state dir', () => {
  const state = join(mkdtempSync(join(tmpdir(), 'epi-src-')), '.epi');
  const token = 'not-a-real-token-1234'; // secret-scan:allow
  const r = run(state, ['EPI_JIRA_TOKEN'], `${token}\r\n`);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(token) && !r.stderr.includes(token), 'token never printed');
  const file = join(state, 'sources', 'epi_jira_token');
  assert.equal(readFileSync(file, 'utf8'), `${token}\n`);
  assert.equal(statSync(file).mode & 0o777, 0o644);
  assert.equal(statSync(state).mode & 0o777, 0o700);
  assert.equal(statSync(join(state, 'sources')).mode & 0o777, 0o755);

  assert.equal(run(state, ['EPI_JIRA_TOKEN', '--remove']).status, 0);
  assert.ok(!existsSync(file));
});

test('source-token refuses bad names and empty input without touching files', () => {
  const state = join(mkdtempSync(join(tmpdir(), 'epi-src-')), '.epi');
  const bad = run(state, ['../x'], 'secret\n');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /usage: \.\/epi\.sh source-token/);
  const empty = run(state, ['EPI_GITLAB_TOKEN'], '\n');
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /no token given/);
  assert.ok(!existsSync(join(state, 'sources', 'epi_gitlab_token')));
});

function runCa(state, file) {
  return spawnSync('bash', [EPI, 'source-ca', file], {
    env: { PATH: process.env.PATH, EPI_STATE_DIR: state },
    encoding: 'utf8',
  });
}

test('source-ca keeps an empty CA file by default and stores only a PEM certificate', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'epi-ca-'));
  const state = join(tmp, '.epi');
  const target = join(state, 'sources', 'ca.pem');
  const cert = join(tmp, 'ca.pem');
  writeFileSync(cert, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  const withKey = join(tmp, 'bundle.pem');
  writeFileSync(
    withKey,
    `${readFileSync(cert, 'utf8')}-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n`, // secret-scan:allow (fake key header for the refusal test)
  );
  const notPem = join(tmp, 'x.txt');
  writeFileSync(notPem, 'hello');

  assert.match(runCa(state, notPem).stderr, /not a PEM certificate/);
  assert.match(runCa(state, withKey).stderr, /contains a private key/);
  assert.ok(!existsSync(target));
  run(state, ['EPI_JIRA_TOKEN', '--remove']); // any command that prepares the state dir
  assert.equal(readFileSync(target, 'utf8'), '', 'empty by default: Node loads it silently');
  const ok = runCa(state, cert);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(readFileSync(target, 'utf8'), readFileSync(cert, 'utf8'));
  assert.equal(statSync(target).mode & 0o777, 0o644);
});
