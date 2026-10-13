import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { CurrentScope } from '../auth/current-scope.decorator';
import { DATA_SOURCE } from '../db/data-source';
import type { Scope } from '../org/scope.service';

export class AuditQuery {
  @ApiPropertyOptional({
    description: 'Exact action, e.g. role.assign, or a prefix ending in ".", e.g. auth.',
  })
  @IsOptional()
  @Matches(/^[a-z_]{1,40}(\.[a-z_]{0,40})?$/)
  action?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Who did it' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'From (inclusive), ISO 8601' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'To (exclusive), ISO 8601' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page (nextCursor)' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,200}$/)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

interface AuditRow {
  id: string;
  at: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Assessment events: administrators may see that a review was written and by whom, but not about
 * whom (spec §5 — admins never see private reviews). Subject and resource are withheld.
 */
function redact(r: AuditRow): AuditRow {
  if (!r.action.startsWith('assessment.')) return r;
  const status = r.metadata?.status;
  return {
    ...r,
    resource_id: null,
    resource_label: null,
    metadata: typeof status === 'string' ? { status } : {},
  };
}

const CURSOR_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function encodeCursor(r: AuditRow): string {
  return Buffer.from(`${r.at}|${r.id}`).toString('base64url');
}

function decodeCursor(c: string): [string, string] {
  const m = CURSOR_RE.exec(Buffer.from(c, 'base64url').toString('utf8'));
  if (!m) throw new BadRequestException('Invalid cursor');
  return [m[1], m[2]];
}

/** Read-only audit trail for administrators (spec §4.9 "Audit & Operations"). */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin')
export class AuditController {
  constructor(@Inject(DATA_SOURCE) private readonly ds: DataSource) {}

  @Get('audit-events')
  @ApiOperation({ summary: 'Audit events, newest first, filterable and paginated' })
  async events(@CurrentScope() scope: Scope, @Query() q: AuditQuery) {
    if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
    const limit = q.limit ?? 50;
    const [cAt, cId] = q.cursor ? decodeCursor(q.cursor) : [null, null];
    const exact = q.action && !q.action.endsWith('.') ? q.action : null;
    const prefix = q.action?.endsWith('.') ? q.action : null;
    const rows: AuditRow[] = await this.ds.query(
      `SELECT e.id,
              to_char(e.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
              e.action, e.actor_user_id AS actor_id, a.display_name AS actor_name,
              e.resource_type, e.resource_id,
              CASE e.resource_type
                WHEN 'user' THEN (SELECT display_name FROM users WHERE id::text = e.resource_id)
                WHEN 'team' THEN (SELECT name FROM teams WHERE id::text = e.resource_id)
                WHEN 'group' THEN (SELECT name FROM org_groups WHERE id::text = e.resource_id)
                WHEN 'integration_connection'
                  THEN (SELECT name FROM integration_connections WHERE id::text = e.resource_id)
              END AS resource_label,
              e.metadata_json AS metadata
       FROM audit_events e LEFT JOIN users a ON a.id = e.actor_user_id
       WHERE ($1::text IS NULL OR e.action = $1)
         AND ($2::text IS NULL OR left(e.action, length($2)) = $2)
         AND ($3::uuid IS NULL OR e.actor_user_id = $3)
         AND ($4::timestamptz IS NULL OR e.at >= $4)
         AND ($5::timestamptz IS NULL OR e.at < $5)
         AND ($6::timestamptz IS NULL OR (e.at, e.id) < ($6::timestamptz, $7::uuid))
       ORDER BY e.at DESC, e.id DESC
       LIMIT $8`,
      [exact, prefix, q.actorId ?? null, q.from ?? null, q.to ?? null, cAt, cId, limit + 1],
    );
    const page = rows.slice(0, limit).map(redact);
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.at,
        action: r.action,
        actor: r.actor_id ? { id: r.actor_id, name: r.actor_name } : null,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        resourceLabel: r.resource_label,
        metadata: r.metadata,
      })),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  @Get('audit-actions')
  @ApiOperation({ summary: 'Distinct audit actions recorded so far (for filters)' })
  async actions(@CurrentScope() scope: Scope): Promise<string[]> {
    if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
    const rows: { action: string }[] = await this.ds.query(
      `SELECT DISTINCT action FROM audit_events ORDER BY action`,
    );
    return rows.map((r) => r.action);
  }
}
