import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
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
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { AccountStatus, IdentityService, Source } from './identity.service';

const SOURCES = ['jira', 'gitlab'] as const;

export class AccountsQuery {
  @ApiPropertyOptional({ enum: SOURCES })
  @IsOptional()
  @IsIn(SOURCES)
  source?: Source;

  @ApiPropertyOptional({ enum: ['unmapped', 'mapped', 'all'], default: 'unmapped' })
  @IsOptional()
  @IsIn(['unmapped', 'mapped', 'all'])
  status?: AccountStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_bots?: boolean;
}

export class UsersQuery {
  @ApiPropertyOptional({ description: 'Name or e-mail contains' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;
}

export class MapAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

function requireAdmin(scope: Scope): void {
  if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
}

function sourceParam(value: string): Source {
  if (!(SOURCES as readonly string[]).includes(value))
    throw new NotFoundException('Unknown source');
  return value as Source;
}

/** Identity mapping and data quality (EPI-008). Admin role only; every change is audited. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Source accounts seen in syncs, with their EPI mapping and activity' })
  accounts(@CurrentScope() scope: Scope, @Query() q: AccountsQuery) {
    requireAdmin(scope);
    return this.identities.accounts(q.source, q.status ?? 'unmapped', q.include_bots === true);
  }

  @Get('users')
  @ApiOperation({ summary: 'Search EPI people (for mapping)' })
  users(@CurrentScope() scope: Scope, @Query() q: UsersQuery) {
    requireAdmin(scope);
    return this.identities.users(q.q);
  }

  @Put('accounts/:source/:externalId/mapping')
  @ApiOperation({ summary: 'Map a source account to an EPI person and re-attribute synced data' })
  map(
    @CurrentScope() scope: Scope,
    @Param('source') source: string,
    @Param('externalId') externalId: string,
    @Body() dto: MapAccountDto,
  ) {
    requireAdmin(scope);
    return this.identities.map(scope.userId, sourceParam(source), externalId, dto.userId);
  }

  @Delete('accounts/:source/:externalId/mapping')
  @ApiOperation({ summary: 'Remove a mapping; synced data becomes unattributed' })
  unmap(
    @CurrentScope() scope: Scope,
    @Param('source') source: string,
    @Param('externalId') externalId: string,
  ) {
    requireAdmin(scope);
    return this.identities.unmap(scope.userId, sourceParam(source), externalId);
  }

  @Get('data-quality')
  @ApiOperation({ summary: 'Sync freshness, identity coverage, unmapped statuses and Jira links' })
  dataQuality(@CurrentScope() scope: Scope) {
    requireAdmin(scope);
    return this.identities.dataQuality();
  }
}
