import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentScope } from '../auth/current-scope.decorator';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import { GitLabSync } from '../ingestion/gitlab/gitlab.sync';
import { JiraSync } from '../ingestion/jira/jira.sync';
import { SyncAlreadyRunningError } from '../ingestion/sync-runs';
import type { Scope } from '../org/scope.service';

const CATEGORIES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'QA', 'DONE'] as const;

export class StartSyncDto {
  @ApiProperty({ description: 'Connection name' })
  @IsString()
  @Length(1, 100)
  connection!: string;

  @ApiPropertyOptional({ description: 'Re-read the whole backfill window' })
  @IsOptional()
  @IsBoolean()
  full?: boolean;
}

export class ConnectionQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  connection?: string;
}

export class StatusMappingDto {
  @ApiProperty({ enum: CATEGORIES, nullable: true, description: 'null = ignore this status' })
  @ValidateIf((o: StatusMappingDto) => o.category !== null)
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number] | null;
}

function requireAdmin(scope: Scope): void {
  if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
}

/** Integration administration. Admin role only; returns no secret values, only reference names. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly jira: JiraSync,
    private readonly gitlab: GitLabSync,
  ) {}

  @Get('integrations')
  @ApiOperation({ summary: 'Configured source connections with their last sync' })
  integrations(@CurrentScope() scope: Scope) {
    requireAdmin(scope);
    return this.ds.query(
      `SELECT c.id, c.kind, c.name, c.endpoint, c.enabled, c.config_json AS config, c.secret_ref,
              (SELECT max(last_success_at) FROM sync_cursors WHERE connection_id = c.id) AS last_success_at,
              (SELECT row_to_json(r) FROM (SELECT status, started_at, finished_at, error_summary
                 FROM sync_runs WHERE connection_id = c.id ORDER BY started_at DESC LIMIT 1) r) AS last_run
       FROM integration_connections c
       WHERE c.kind <> 'synthetic' ORDER BY c.name`,
    );
  }

  @Get('sync-runs')
  @ApiOperation({ summary: 'Recent sync runs (newest first, max 50)' })
  syncRuns(@CurrentScope() scope: Scope, @Query() q: ConnectionQuery) {
    requireAdmin(scope);
    return this.ds.query(
      `SELECT r.id, c.name AS connection, r.status, r.started_at, r.finished_at, r.counts_json AS counts,
              r.error_summary
       FROM sync_runs r JOIN integration_connections c ON c.id = r.connection_id
       WHERE ($1::text IS NULL OR c.name = $1) ORDER BY r.started_at DESC LIMIT 50`,
      [q.connection ?? null],
    );
  }

  @Post('sync')
  @HttpCode(202)
  @ApiOperation({ summary: 'Start a Jira or GitLab sync in the background; poll sync-runs' })
  async startSync(@CurrentScope() scope: Scope, @Body() dto: StartSyncDto) {
    requireAdmin(scope);
    const [conn] = await this.ds.query(
      `SELECT id, kind FROM integration_connections WHERE name = $1 AND kind IN ('jira','gitlab')`,
      [dto.connection],
    );
    if (!conn) throw new NotFoundException('Unknown connection');
    const collector = conn.kind === 'jira' ? this.jira : this.gitlab;
    const runId = await new Promise<string>((resolve, reject) => {
      collector
        .run(dto.connection, { fullBackfill: dto.full === true, onStarted: resolve })
        .catch(reject);
    }).catch((e: unknown) => {
      if (e instanceof SyncAlreadyRunningError) throw new ConflictException(e.message);
      throw e;
    });
    await this.audit.record(scope.userId, 'sync.start', 'integration_connection', conn.id, {
      runId,
      full: dto.full === true,
    });
    return { runId, status: 'running' };
  }

  @Get('status-mappings')
  @ApiOperation({ summary: 'Source status → EPI category mappings (inferred or admin-set)' })
  async mappings(@CurrentScope() scope: Scope, @Query() q: ConnectionQuery) {
    requireAdmin(scope);
    return this.ds.query(
      `SELECT c.name AS connection, m.source_status_id, m.source_status_name, m.category, m.origin, m.updated_at
       FROM status_mappings m JOIN integration_connections c ON c.id = m.connection_id
       WHERE ($1::text IS NULL OR c.name = $1) ORDER BY c.name, m.source_status_name`,
      [q.connection ?? null],
    );
  }

  @Put('status-mappings/:connection/:statusId')
  @ApiOperation({ summary: 'Set the EPI category for a source status (applies on next sync)' })
  async setMapping(
    @CurrentScope() scope: Scope,
    @Param('connection') connection: string,
    @Param('statusId') statusId: string,
    @Body() dto: StatusMappingDto,
  ) {
    requireAdmin(scope);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(statusId)) throw new NotFoundException('Unknown status');
    const [row] = await rows<{ source_status_name: string }>(
      this.ds,
      `UPDATE status_mappings m SET category = $3, origin = 'admin', updated_at = now()
       FROM integration_connections c
       WHERE c.id = m.connection_id AND c.name = $1 AND m.source_status_id = $2
       RETURNING m.source_status_name`,
      [connection, statusId, dto.category],
    );
    if (!row) throw new NotFoundException('Unknown connection or status');
    await this.audit.record(
      scope.userId,
      'status_mapping.update',
      'status_mapping',
      `${connection}/${statusId}`,
      {
        category: dto.category,
      },
    );
    return {
      connection,
      statusId,
      statusName: row.source_status_name,
      category: dto.category,
      origin: 'admin',
    };
  }
}
