import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { SettingsService } from './settings.service';

export class UpdateConnectionDto {
  @ApiProperty({ example: 'https://jira.corp.example' })
  @IsString()
  @Length(8, 300)
  url!: string;

  @ApiProperty({ type: [String], example: ['PAY'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  projects!: string[];

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    example: 'EPI_JIRA_TOKEN',
    description: 'Name of the token secret on the server',
  })
  @IsOptional()
  @IsString()
  @Length(3, 64)
  secretRef?: string;
}

export class CreateConnectionDto {
  @ApiProperty({ enum: ['jira', 'gitlab'] })
  @IsIn(['jira', 'gitlab'])
  kind!: 'jira' | 'gitlab';

  @ApiProperty({ example: 'jira-main' })
  @IsString()
  @Length(2, 40)
  name!: string;

  @ApiProperty({ example: 'https://jira.corp.example' })
  @IsString()
  @Length(8, 300)
  url!: string;

  @ApiProperty({ type: [String], example: ['PAY'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  projects!: string[];

  @ApiPropertyOptional({ example: 'EPI_JIRA_TOKEN' })
  @IsOptional()
  @IsString()
  @Length(3, 64)
  secretRef?: string;
}

function requireAdmin(scope: Scope): void {
  if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
}

/** Administration › Settings (ADR-033). Admin only, CSRF-protected, every change audited. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Source connections (no tokens) and read-only server settings' })
  read(@CurrentScope() scope: Scope) {
    requireAdmin(scope);
    return this.settings.read();
  }

  @Post('connections')
  @ApiOperation({ summary: 'Add a Jira or GitLab connection (token stays a file on the server)' })
  create(@CurrentScope() scope: Scope, @Body() dto: CreateConnectionDto) {
    requireAdmin(scope);
    return this.settings.create(scope.userId, dto);
  }

  @Put('connections/:id')
  @ApiOperation({ summary: 'Change a connection address, projects, token name or on/off' })
  update(
    @CurrentScope() scope: Scope,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    requireAdmin(scope);
    return this.settings.update(scope.userId, id, dto);
  }

  @Post('connections/:id/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the connection with the server-side token (read-only)' })
  test(@CurrentScope() scope: Scope, @Param('id', new ParseUUIDPipe()) id: string) {
    requireAdmin(scope);
    return this.settings.test(id);
  }
}
