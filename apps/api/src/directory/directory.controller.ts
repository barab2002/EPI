import { RequestLocale, type Locale } from '../common/locale';
import { translateMessage } from '../common/messages-he';
import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { DirectoryService } from './directory.service';

export class MappingDto {
  @ApiProperty({ description: 'A team group DN from EPI_LDAP_TEAM_GROUPS' })
  @IsString()
  @Length(3, 500)
  groupDn!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = not imported' })
  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}

export class ApplyDto {
  @ApiProperty({ description: 'Hash of the previewed plan (from POST /admin/directory/preview)' })
  @Matches(/^[0-9a-f]{64}$/)
  hash!: string;
}

function requireAdmin(scope: Scope): void {
  if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
}

/** AD team import (EPI-004c). Admin only; the directory is only ever read. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin/directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  @ApiOperation({ summary: 'Directory import configuration, group → team mappings, last import' })
  status(@CurrentScope() scope: Scope) {
    requireAdmin(scope);
    return this.directory.status();
  }

  @Put('mappings')
  @ApiOperation({ summary: 'Map a configured directory team group to an EPI team (or unmap it)' })
  setMapping(@CurrentScope() scope: Scope, @Body() dto: MappingDto) {
    requireAdmin(scope);
    return this.directory.setMapping(scope.userId, dto.groupDn, dto.teamId ?? null);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Read the directory and show what an import would change (no changes)' })
  async preview(@CurrentScope() scope: Scope, @RequestLocale() locale: Locale) {
    requireAdmin(scope);
    const p = await this.directory.preview();
    // Reasons and warnings in the reader's language; the hash covers the plan, not its wording.
    return {
      ...p,
      plan: {
        ...p.plan,
        conflicts: p.plan.conflicts.map((c) => ({
          ...c,
          reason: translateMessage(c.reason, locale),
        })),
        warnings: p.plan.warnings.map((w) => translateMessage(w, locale)),
      },
    };
  }

  @Post('apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply exactly the previewed plan (409 if anything changed since)' })
  apply(@CurrentScope() scope: Scope, @Body() dto: ApplyDto) {
    requireAdmin(scope);
    return this.directory.apply(scope.userId, dto.hash);
  }
}
