import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Role, Scope } from '../org/scope.service';
import { OrgAdminService } from './org-admin.service';

const ASSIGNABLE_ROLES = [
  'TEAM_LEAD',
  'GROUP_MANAGER',
  'ENGINEERING_MANAGER',
  'ADMIN',
  'HR_PARTNER',
] as const;
const SCOPES = ['ORGANIZATION', 'GROUP', 'TEAM', 'SYSTEM'] as const;

class NameDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class CreateGroupDto extends NameDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}

export class CreateTeamDto extends NameDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId!: string;
}

export class RenameDto extends NameDto {}

export class UpdateTeamDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) name?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() groupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePersonDto {
  @ApiProperty() @IsString() @Length(1, 120) displayName!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.email !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
}

export class UpdatePersonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) displayName?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.email !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class AddMembershipDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() teamId!: string;
  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
  @ApiPropertyOptional({
    default: true,
    description: 'End other current memberships at the same instant',
  })
  @IsOptional()
  @IsBoolean()
  transfer?: boolean;
}

export class EndDto {
  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class AssignRoleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
  @ApiProperty({ enum: ASSIGNABLE_ROLES }) @IsIn(ASSIGNABLE_ROLES) role!: Role;
  @ApiProperty({ enum: SCOPES }) @IsIn(SCOPES) scopeType!: (typeof SCOPES)[number];
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((o) => o.scopeType !== 'SYSTEM')
  @IsUUID()
  scopeId?: string | null;
  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}

export class SetGradeDto {
  @ApiProperty({ example: 'SENIOR' }) @IsString() @Length(1, 40) gradeCode!: string;
  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}

function requireAdmin(scope: Scope): void {
  if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
}

/** Organization administration (EPI-004b). Admin role only; history kept; all changes audited. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin')
export class OrgAdminController {
  constructor(private readonly org: OrgAdminService) {}

  @Post('groups')
  @ApiOperation({ summary: 'Create a group' })
  createGroup(@CurrentScope() s: Scope, @Body() dto: CreateGroupDto) {
    requireAdmin(s);
    return this.org.createGroup(s.userId, dto.organizationId, dto.name);
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: 'Rename a group' })
  renameGroup(
    @CurrentScope() s: Scope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameDto,
  ) {
    requireAdmin(s);
    return this.org.renameGroup(s.userId, id, dto.name);
  }

  @Post('teams')
  @ApiOperation({ summary: 'Create a team' })
  createTeam(@CurrentScope() s: Scope, @Body() dto: CreateTeamDto) {
    requireAdmin(s);
    return this.org.createTeam(s.userId, dto.groupId, dto.name);
  }

  @Patch('teams/:id')
  @ApiOperation({ summary: 'Rename, move to another group, or (de)activate a team' })
  updateTeam(
    @CurrentScope() s: Scope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    requireAdmin(s);
    return this.org.updateTeam(s.userId, id, dto);
  }

  @Get('teams/:id/memberships')
  @ApiOperation({ summary: 'Current and past members of a team' })
  teamMembers(@CurrentScope() s: Scope, @Param('id', ParseUUIDPipe) id: string) {
    requireAdmin(s);
    return this.org.teamMembers(id);
  }

  @Post('people')
  @ApiOperation({ summary: 'Create a person' })
  createPerson(@CurrentScope() s: Scope, @Body() dto: CreatePersonDto) {
    requireAdmin(s);
    return this.org.createPerson(s.userId, dto.displayName, dto.email ?? null);
  }

  @Get('people/:id')
  @ApiOperation({ summary: 'Person with memberships, roles and grade history' })
  person(@CurrentScope() s: Scope, @Param('id', ParseUUIDPipe) id: string) {
    requireAdmin(s);
    return this.org.person(id);
  }

  @Patch('people/:id')
  @ApiOperation({ summary: 'Update or (de)activate a person (deactivation ends their sessions)' })
  updatePerson(
    @CurrentScope() s: Scope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
  ) {
    requireAdmin(s);
    return this.org.updatePerson(s.userId, id, dto);
  }

  @Post('memberships')
  @ApiOperation({ summary: 'Add a person to a team (transfer by default)' })
  addMembership(@CurrentScope() s: Scope, @Body() dto: AddMembershipDto) {
    requireAdmin(s);
    return this.org.addMembership(
      s.userId,
      dto.userId,
      dto.teamId,
      dto.effectiveFrom ?? new Date(),
      dto.transfer ?? true,
    );
  }

  @Post('memberships/:id/end')
  @ApiOperation({ summary: 'End a membership (history is kept)' })
  endMembership(
    @CurrentScope() s: Scope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EndDto,
  ) {
    requireAdmin(s);
    return this.org.endMembership(s.userId, id, dto.effectiveTo ?? new Date());
  }

  @Post('role-assignments')
  @ApiOperation({ summary: 'Assign a role on a scope (never to yourself)' })
  assignRole(@CurrentScope() s: Scope, @Body() dto: AssignRoleDto) {
    requireAdmin(s);
    return this.org.assignRole(s.userId, {
      userId: dto.userId,
      role: dto.role,
      scopeType: dto.scopeType,
      scopeId: dto.scopeType === 'SYSTEM' ? null : (dto.scopeId ?? null),
      effectiveFrom: dto.effectiveFrom ?? new Date(),
    });
  }

  @Post('role-assignments/:id/end')
  @ApiOperation({ summary: 'End a role assignment (never your own; at least one admin remains)' })
  endRole(@CurrentScope() s: Scope, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EndDto) {
    requireAdmin(s);
    return this.org.endRole(s.userId, id, dto.effectiveTo ?? new Date());
  }

  @Get('grades')
  @ApiOperation({ summary: 'Professional grade ladder' })
  grades(@CurrentScope() s: Scope) {
    requireAdmin(s);
    return this.org.grades();
  }

  @Post('people/:id/grade')
  @ApiOperation({ summary: 'Set a new grade from a date (previous grade is closed, history kept)' })
  setGrade(
    @CurrentScope() s: Scope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetGradeDto,
  ) {
    requireAdmin(s);
    return this.org.setGrade(s.userId, id, dto.gradeCode, dto.effectiveFrom ?? new Date());
  }
}
