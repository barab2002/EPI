import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSecret, secretFileName } from './secrets';

describe('resolveSecret', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'epi-secrets-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('names the file in the sources directory after the reference, in lower case', () => {
    expect(secretFileName('EPI_JIRA_TOKEN')).toBe('epi_jira_token');
  });

  it('reads <REF>_FILE first, trimming the trailing newline', () => {
    writeFileSync(join(dir, 'a'), 'from-file\n');
    writeFileSync(join(dir, 'epi_jira_token'), 'from-dir\n');
    const env = {
      EPI_JIRA_TOKEN_FILE: join(dir, 'a'),
      EPI_SOURCE_SECRETS_DIR: dir,
      EPI_JIRA_TOKEN: 'from-env', // secret-scan:allow
    };
    expect(resolveSecret('EPI_JIRA_TOKEN', env)).toBe('from-file');
  });

  it('then the file named after the reference in EPI_SOURCE_SECRETS_DIR', () => {
    writeFileSync(join(dir, 'epi_gitlab_token'), 'from-dir\n');
    const env = { EPI_SOURCE_SECRETS_DIR: dir, EPI_GITLAB_TOKEN: 'from-env' }; // secret-scan:allow
    expect(resolveSecret('EPI_GITLAB_TOKEN', env)).toBe('from-dir');
  });

  it('then the variable itself', () => {
    expect(
      resolveSecret('EPI_JIRA_TOKEN', { EPI_SOURCE_SECRETS_DIR: dir, EPI_JIRA_TOKEN: 'v' }),
    ).toBe('v');
  });

  it('says where to put a missing token, never what it might be', () => {
    expect(() => resolveSecret('EPI_JIRA_TOKEN', { EPI_SOURCE_SECRETS_DIR: dir })).toThrow(
      'Secret EPI_JIRA_TOKEN is not provided (on the server: ./epi.sh source-token EPI_JIRA_TOKEN)',
    );
    expect(() => resolveSecret('EPI_JIRA_TOKEN', {})).toThrow(
      'Secret EPI_JIRA_TOKEN is not provided (set EPI_JIRA_TOKEN_FILE to a root-only file)',
    );
  });

  it('refuses an empty or unreadable file in the sources directory', () => {
    writeFileSync(join(dir, 'epi_jira_token'), '\n');
    expect(() => resolveSecret('EPI_JIRA_TOKEN', { EPI_SOURCE_SECRETS_DIR: dir })).toThrow(
      'Secret EPI_JIRA_TOKEN: file epi_jira_token in the sources directory is empty',
    );
    if (process.getuid?.() !== 0) {
      writeFileSync(join(dir, 'epi_jira_token'), 'x');
      chmodSync(join(dir, 'epi_jira_token'), 0o000);
      expect(() => resolveSecret('EPI_JIRA_TOKEN', { EPI_SOURCE_SECRETS_DIR: dir })).toThrow(
        /is not readable/,
      );
    }
  });

  it('rejects reference names that could escape the directory', () => {
    expect(() => resolveSecret('../etc/passwd', { EPI_SOURCE_SECRETS_DIR: dir })).toThrow(
      /Invalid secret reference name/,
    );
  });
});
