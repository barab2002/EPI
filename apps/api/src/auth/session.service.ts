import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';

export interface SessionInfo {
  userId: string;
  csrfToken: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Opaque server-side sessions. Only a SHA-256 of the cookie token is stored. */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
  ) {}

  async create(userId: string): Promise<{ token: string; csrfToken: string }> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    await this.ds.query(
      `INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at)
       VALUES ($1,$2,$3, now() + make_interval(mins => $4))`,
      [hash(token), userId, csrfToken, this.config.sessionIdleMinutes],
    );
    return { token, csrfToken };
  }

  /** Validates and slides the idle timeout. Returns null for unknown/expired sessions. */
  async touch(token: string | undefined): Promise<SessionInfo | null> {
    if (!token || token.length > 128) return null;
    const found = await rows<{ user_id: string; csrf_token: string }>(
      this.ds,
      `UPDATE sessions s SET last_seen_at = now(), expires_at = now() + make_interval(mins => $2)
       FROM users u
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.id = s.user_id AND u.active
       RETURNING s.user_id, s.csrf_token`,
      [hash(token), this.config.sessionIdleMinutes],
    );
    const row = found[0];
    if (!row?.user_id || !row.csrf_token) return null;
    return { userId: row.user_id, csrfToken: row.csrf_token };
  }

  async destroy(token: string | undefined): Promise<void> {
    if (token) await this.ds.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  }
}
