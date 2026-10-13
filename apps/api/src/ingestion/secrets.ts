import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** File name of a reference in the sources directory: `EPI_JIRA_TOKEN` → `epi_jira_token`. */
export const secretFileName = (ref: string) => ref.toLowerCase();

function readSecret(ref: string, path: string, what: string): string {
  let v: string;
  try {
    v = readFileSync(path, 'utf8').trim();
  } catch {
    throw new Error(`Secret ${ref}: ${what} is not readable`);
  }
  if (!v) throw new Error(`Secret ${ref}: ${what} is empty`);
  return v;
}

/**
 * Resolves a secret reference (e.g. `EPI_JIRA_TOKEN`), in order: the file named by `<REF>_FILE`;
 * the file `<ref>` in EPI_SOURCE_SECRETS_DIR (the installation's `.epi/sources`, written by
 * `./epi.sh source-token`, so connections added in Settings need no Compose change); `<REF>`.
 * The database only ever stores the reference name.
 */
export function resolveSecret(ref: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(ref)) throw new Error(`Invalid secret reference name: ${ref}`);
  const file = env[`${ref}_FILE`];
  if (file) return readSecret(ref, file, `file from ${ref}_FILE`);
  const dir = env.EPI_SOURCE_SECRETS_DIR;
  const inDir = dir ? join(dir, secretFileName(ref)) : null;
  if (inDir && existsSync(inDir)) {
    return readSecret(ref, inDir, `file ${secretFileName(ref)} in the sources directory`);
  }
  const v = env[ref]?.trim();
  if (v) return v;
  throw new Error(
    dir
      ? `Secret ${ref} is not provided (on the server: ./epi.sh source-token ${ref})`
      : `Secret ${ref} is not provided (set ${ref}_FILE to a root-only file)`,
  );
}
