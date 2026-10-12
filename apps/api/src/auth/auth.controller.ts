import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { AuthedRequest, Public, SESSION_COOKIE } from './auth.guard';
import { SessionService } from './session.service';

export class DemoLoginDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

@ApiTags('auth')
@Controller('api/v1')
export class AuthController {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private assertDemo(): void {
    // Indistinguishable from a missing route outside demo mode.
    if (this.config.mode !== 'demo') throw new NotFoundException();
  }

  @Public()
  @Get('auth/config')
  @ApiOperation({ summary: 'Which sign-in methods are available' })
  authConfig() {
    return { mode: this.config.mode, demoLogin: this.config.mode === 'demo', oidc: false };
  }

  @Public()
  @Get('auth/demo-users')
  @ApiOperation({ summary: 'DEMO MODE ONLY: synthetic users to sign in as' })
  async demoUsers() {
    this.assertDemo();
    return this.ds.query(
      `SELECT u.id, u.display_name,
              COALESCE((SELECT string_agg(DISTINCT ra.role::text, ',') FROM role_assignments ra
                        WHERE ra.user_id = u.id AND (ra.effective_to IS NULL OR ra.effective_to > now())),
                       'DEVELOPER') AS roles,
              (SELECT t.name FROM team_memberships m JOIN teams t ON t.id = m.team_id
               WHERE m.user_id = u.id AND m.effective_to IS NULL LIMIT 1) AS team
       FROM users u WHERE u.is_synthetic AND u.active ORDER BY u.display_name`,
    );
  }

  @Public()
  @Post('auth/demo-login')
  @HttpCode(204)
  @ApiOperation({ summary: 'DEMO MODE ONLY: start a session as a synthetic user' })
  async demoLogin(@Body() dto: DemoLoginDto, @Res({ passthrough: true }) res: Response) {
    this.assertDemo();
    const [u] = await this.ds.query(
      `SELECT id FROM users WHERE id = $1 AND is_synthetic AND active`,
      [dto.userId],
    );
    if (!u) throw new NotFoundException('Unknown demo user');
    const { token } = await this.sessions.create(u.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
    });
    await this.audit.record(u.id, 'auth.login', 'session', null, { method: 'demo' });
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiCookieAuth()
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await this.audit.record(req.scope.userId, 'auth.logout', 'session', null);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current user, effective roles and CSRF token for mutations' })
  async me(@Req() req: AuthedRequest) {
    const s = req.scope;
    const [u] = await this.ds.query(
      `SELECT id, display_name, is_synthetic FROM users WHERE id = $1`,
      [s.userId],
    );
    const teams = await this.ds.query(
      `SELECT t.id, t.name FROM team_memberships m JOIN teams t ON t.id = m.team_id
       WHERE m.user_id = $1 AND m.effective_from <= now() AND (m.effective_to IS NULL OR m.effective_to > now())`,
      [s.userId],
    );
    return {
      user: u,
      roles: s.roles,
      csrfToken: req.csrfToken,
      teams,
      managedOrganizationIds: [...s.managedOrganizationIds],
      managedGroupIds: [...s.managedGroupIds],
      managedTeamIds: [...s.managedTeamIds],
      canReview: s.reviewableUserIds.size > 0,
      mode: this.config.mode,
    };
  }
}
