import { Client } from 'ldapts';
import type { DirectoryConfig } from '../config';

/** A person as read from the directory (no other attributes are requested). */
export interface DirectoryPerson {
  /** Stable directory ID: AD objectGUID or LDAP entryUUID. */
  externalId: string;
  username: string;
  email: string | null;
  displayName: string;
}

/** Directory failure with an admin-readable message (never contains credentials). */
export class DirectoryError extends Error {}

const LDAP_CODES: Record<number, string> = {
  32: 'an entry does not exist (check the users/groups DNs)',
  49: 'the directory refused the read-only bind account (invalid credentials)',
  50: 'the bind account lacks read rights',
  51: 'the directory is busy',
  52: 'the directory is unavailable',
  53: 'the directory is unwilling to perform the request',
};

/** Maps ldapts/TLS/socket errors to a safe, actionable message. */
export function describeError(e: unknown): string {
  const err = e as { code?: number | string; message?: string };
  if (typeof err.code === 'number' && LDAP_CODES[err.code]) return LDAP_CODES[err.code];
  const msg = err.message ?? String(e);
  if (/certificate|self[- ]signed|CERT_|unable to verify/i.test(msg))
    return `TLS: the directory's certificate is not trusted (${msg.trim()}); check EPI_LDAP_CA_FILE`;
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timeout/i.test(msg))
    return `cannot reach the directory (${msg.trim()})`;
  return `directory error: ${msg.trim() || 'unknown'}`;
}

export interface DirectoryGroup {
  dn: string;
  name: string | null; // null = group not found
  members: DirectoryPerson[];
}

/** RFC 4515 filter value escaping. */
export function escapeFilter(v: string): string {
  return v.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/** AD objectGUID bytes → canonical GUID string (first three groups are little-endian). */
export function guidToString(b: Buffer): string {
  const h = (i: number[]) => i.map((x) => b[x].toString(16).padStart(2, '0')).join('');
  return [h([3, 2, 1, 0]), h([5, 4]), h([7, 6]), h([8, 9]), h([10, 11, 12, 13, 14, 15])].join('-');
}

const DIALECTS = {
  ad: {
    username: 'sAMAccountName',
    uuid: 'objectGUID',
    // IN_CHAIN: members of nested groups too; disabled accounts excluded (same as sign-in).
    filter: (dn: string) =>
      `(&(objectClass=user)(memberOf:1.2.840.113556.1.4.1941:=${escapeFilter(dn)})` +
      `(!(userAccountControl:1.2.840.113556.1.4.803:=2)))`,
  },
  other: {
    username: 'uid',
    uuid: 'entryUUID',
    filter: (dn: string) => `(&(objectClass=inetOrgPerson)(memberOf=${escapeFilter(dn)}))`,
  },
} as const;

const first = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  if (x === undefined || x === null || x === '') return null;
  return Buffer.isBuffer(x) ? x.toString('utf8') : String(x);
};

/**
 * Read-only directory reader for the team import. Binds with the read-only account over LDAPS,
 * reads only the configured team groups' members and only name/e-mail/username/ID attributes.
 */
export class DirectoryClient {
  constructor(private readonly cfg: DirectoryConfig) {}

  async readTeamGroups(): Promise<DirectoryGroup[]> {
    const d = DIALECTS[this.cfg.vendor];
    const client = new Client({
      url: this.cfg.url,
      timeout: 30_000,
      connectTimeout: 10_000,
      tlsOptions: this.cfg.caPem ? { ca: [this.cfg.caPem], minVersion: 'TLSv1.2' } : undefined,
    });
    try {
      await client.bind(this.cfg.bindDn, this.cfg.bindPassword);
      const groups: DirectoryGroup[] = [];
      for (const dn of this.cfg.teamGroups) {
        const name = await this.groupName(client, dn);
        if (name === null) {
          groups.push({ dn, name: null, members: [] });
          continue;
        }
        const { searchEntries } = await client.search(this.cfg.usersDn, {
          scope: 'sub',
          filter: d.filter(dn),
          attributes: [d.username, d.uuid, 'mail', 'displayName', 'cn', 'givenName', 'sn'],
          explicitBufferAttributes: d.uuid === 'objectGUID' ? ['objectGUID'] : [],
          paged: { pageSize: 500 },
        });
        const members: DirectoryPerson[] = [];
        for (const e of searchEntries) {
          const raw = e[d.uuid];
          const id = Buffer.isBuffer(raw)
            ? guidToString(raw)
            : Array.isArray(raw) && Buffer.isBuffer(raw[0])
              ? guidToString(raw[0])
              : first(raw);
          const username = first(e[d.username]);
          if (!id || !username) continue;
          const given = first(e.givenName);
          const sn = first(e.sn);
          members.push({
            externalId: id.toLowerCase(),
            username,
            email: first(e.mail)?.toLowerCase() ?? null,
            displayName:
              first(e.displayName) ??
              ([given, sn].filter(Boolean).join(' ') || first(e.cn) || username),
          });
        }
        members.sort((a, b) => a.displayName.localeCompare(b.displayName));
        groups.push({ dn, name, members });
      }
      return groups;
    } catch (e) {
      throw new DirectoryError(describeError(e));
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private async groupName(client: Client, dn: string): Promise<string | null> {
    try {
      const { searchEntries } = await client.search(dn, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: ['cn'],
      });
      return first(searchEntries[0]?.cn) ?? dn;
    } catch (e) {
      if ((e as { code?: number }).code === 32) return null; // noSuchObject
      throw e;
    }
  }
}
