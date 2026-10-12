import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { findKpi, KPI_CATALOG } from './catalog';
import { EntityType, KpiService, WindowKey, WINDOWS } from './kpi.service';

export class KpiQueryDto {
  @ApiProperty({ enum: ['developer', 'team', 'group', 'organization'] })
  @IsIn(['developer', 'team', 'group', 'organization'])
  entity_type!: EntityType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entity_id!: string;

  @ApiPropertyOptional({ enum: Object.keys(WINDOWS), default: '90d' })
  @IsOptional()
  @IsIn(Object.keys(WINDOWS))
  window?: WindowKey;
}

const summary = (k: (typeof KPI_CATALOG)[number]) => ({
  code: k.code,
  version: k.version,
  title: k.title,
  question: k.question,
  unit: k.unit,
  direction: k.direction,
  scopes: k.scopes,
});

@ApiTags('kpis')
@ApiCookieAuth()
@Controller('api/v1/kpis')
export class KpiController {
  constructor(private readonly kpis: KpiService) {}

  @Get()
  @ApiOperation({
    summary: 'KPI cards for an entity the caller may see',
    description:
      'Values are null (N/A) when the sample is insufficient or the aggregate is suppressed. Evidence is included only for callers with member-level access.',
  })
  list(@CurrentScope() scope: Scope, @Query() q: KpiQueryDto) {
    return this.kpis.cards(scope, q.entity_type, q.entity_id, q.window ?? '90d');
  }

  @Get('catalog')
  @ApiOperation({ summary: 'All KPI definitions (no data)' })
  catalog() {
    return KPI_CATALOG.map(summary);
  }

  @Get(':code/explanation')
  @ApiOperation({
    summary: 'Full definition with a reproducible worked example computed by the engine',
  })
  explanation(@Param('code') code: string) {
    const k = findKpi(code);
    if (!k) throw new NotFoundException('Unknown KPI');
    const { example, ...rest } = k;
    return { ...rest, example: example() };
  }
}
