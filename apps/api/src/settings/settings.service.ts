import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import { checkGitLabConnection } from '../ingestion/gitlab/gitlab.sync';
import { checkJiraConnection } from '../ingestion/jira/jira.sync';
import { resolveSecret } from '../ingestion/secrets';
import { ConnectionInput, normalizeConnection } from './connection-input';

interface ConnectionRow {
  id: string;
  kind: 'jira' | 'gitlab';
  name: string;
  endpoint: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
  secret_ref: string | null;
}

const hostOf = (endpoint: string) => new URL(endpoint).host;

/**
 * Administration › Settings (ADR-033): Jira/GitLab addresses and projects are edited in the UI;
 * tokens stay in files on the server (only their presence is shown); sign-in, directory, privacy
 * and retention settings are shown read-only because they are install-time server settings.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    private readonly audit: AuditService,
  ) {}

  private rules() {
    return { allowHttp: this.config.mode === 'demo', allowedHosts: this.config.sourceHosts };
  }

  private tokenPresent(ref: string | null): boolean {
    try {
      resolveSecret(ref ?? '');
      return true;
    } catch {
      return false;
    }
  }

  async read() {
    const conns = await rows<ConnectionRow>(
      this.ds,
      `SELECT id, kind, name, endpoint, enabled, config_json, secret_ref
         FROM integration_connections WHERE kind IN ('jira','gitlab') ORDER BY kind, name`,
    );
    const c = this.config;
    return {
      connections: conns.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        url: r.endpoint,
        enabled: r.enabled,
        projects: ((r.kind === 'jira' ? r.config_json.projectKeys : r.config_json.projectIds) ??
          []) as string[],
        secretRef: r.secret_ref,
        tokenPresent: this.tokenPresent(r.secret_ref),
      })),
      rules: { httpAllowed: this.rules().allowHttp, allowedHosts: c.sourceHosts },
      server: {
        mode: c.mode,
        publicUrl: c.publicUrl,
        signIn: c.oidc ? { issuer: c.oidc.issuer } : null,
        directory: c.directory
          ? {
              url: c.directory.url,
              usersDn: c.directory.usersDn,
              teamGroups: c.directory.teamGroups,
            }
          : null,
        minimumGroupSize: c.minimumAggregateSize,
        retentionMonths: c.retentionMonths,
      },
    };
  }

  private normalize(i: ConnectionInput) {
    try {
      return normalizeConnection(i, this.rules());
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  async create(actor: string, input: ConnectionInput) {
    const n = this.normalize(input);
    const config =
      n.kind === 'jira'
        ? { projectKeys: n.projects, storyPointsField: 'auto', backfillMonths: 6 }
        : { projectIds: n.projects, botUsernames: [], backfillMonths: 6 };
    return this.ds.transaction(async (m) => {
      const [dup] = await rows(m, `SELECT 1 FROM integration_connections WHERE name = $1`, [
        n.name,
      ]);
      if (dup) throw new ConflictException(`A connection named "${n.name}" already exists`);
      const [row] = await rows<{ id: string }>(
        m,
        `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [n.kind, n.name, n.endpoint, JSON.stringify(config), n.secretRef],
      );
      await this.audit.record(
        actor,
        'integration.create',
        'integration_connection',
        row.id,
        { kind: n.kind, name: n.name, host: hostOf(n.endpoint), projects: n.projects },
        m,
      );
      return { id: row.id, ...n };
    });
  }

  async update(
    actor: string,
    id: string,
    input: { url: string; projects: string[]; enabled: boolean; secretRef?: string },
  ) {
    return this.ds.transaction(async (m) => {
      const [cur] = await rows<ConnectionRow>(
        m,
        `SELECT id, kind, name, endpoint, enabled, config_json, secret_ref
           FROM integration_connections WHERE id = $1 AND kind IN ('jira','gitlab') FOR UPDATE`,
        [id],
      );
      if (!cur) throw new NotFoundException('Connection not found');
      const n = this.normalize({
        kind: cur.kind,
        name: cur.name,
        url: input.url,
        projects: input.projects,
        secretRef: input.secretRef ?? cur.secret_ref ?? undefined,
      });
      const key = cur.kind === 'jira' ? 'projectKeys' : 'projectIds';
      const config = { ...cur.config_json, [key]: n.projects };
      await m.query(
        `UPDATE integration_connections SET endpoint = $2, config_json = $3, secret_ref = $4, enabled = $5
          WHERE id = $1`,
        [id, n.endpoint, JSON.stringify(config), n.secretRef, input.enabled],
      );
      const changed: Record<string, unknown> = {};
      if (cur.endpoint !== n.endpoint)
        changed.host = { from: hostOf(cur.endpoint), to: hostOf(n.endpoint) };
      if (JSON.stringify(cur.config_json[key]) !== JSON.stringify(n.projects))
        changed.projects = n.projects;
      if (cur.enabled !== input.enabled) changed.enabled = input.enabled;
      if (cur.secret_ref !== n.secretRef) changed.secretRef = n.secretRef;
      await this.audit.record(
        actor,
        'integration.update',
        'integration_connection',
        id,
        { name: cur.name, ...changed },
        m,
      );
      return { id, ...n, enabled: input.enabled };
    });
  }

  /** Read-only check against the source with the server-side token; nothing is stored. */
  async test(id: string) {
    const [cur] = await rows<{ kind: 'jira' | 'gitlab'; name: string }>(
      this.ds,
      `SELECT kind, name FROM integration_connections WHERE id = $1 AND kind IN ('jira','gitlab')`,
      [id],
    );
    if (!cur) throw new NotFoundException('Connection not found');
    try {
      if (cur.kind === 'jira') {
        const r = await checkJiraConnection(this.ds, cur.name);
        return {
          ok: true,
          summary: `Jira ${r.version}: token accepted, ${r.statuses} statuses visible, ${r.matchingIssues} issues in the backfill window.`,
        };
      }
      const r = await checkGitLabConnection(this.ds, cur.name);
      return {
        ok: true,
        summary: `GitLab ${r.version}: token accepted, ${r.projects.length} project(s) readable.`,
      };
    } catch (e) {
      return { ok: false, summary: (e as Error).message };
    }
  }
}
