import { readFileSync } from 'node:fs';

/**
 * Resolves a secret reference (e.g. `EPI_JIRA_TOKEN`) from the environment: `<REF>_FILE` (a
 * mounted secret file, preferred) or `<REF>`. The database only ever stores the reference name.
 */
export function resolveSecret(ref: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(ref)) throw new Error(`Invalid secret reference name: ${ref}`);
  const file = env[`${ref}_FILE`];
  if (file) {
    let v: string;
    try {
      v = readFileSync(file, 'utf8').trim();
    } catch {
      throw new Error(`Secret ${ref}: file from ${ref}_FILE is not readable`);
    }
    if (!v) throw new Error(`Secret ${ref}: file from ${ref}_FILE is empty`);
    return v;
  }
  const v = env[ref]?.trim();
  if (v) return v;
  throw new Error(`Secret ${ref} is not provided (set ${ref}_FILE to a root-only file)`);
}
