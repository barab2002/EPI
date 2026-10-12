import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { AuthedRequest, Public, SESSION_COOKIE } from './auth.guard';
import { OidcLoginError, OidcService } from './oidc.service';
import { SessionService } from './session.service';

export const OIDC_BINDING_COOKIE = 'epi_oidc';
const OIDC_COOKIE_PATH = '/api/v1/auth';

export class LoginQuery {
  @ApiPropertyOptional({ description: 'Relative path to return to after sign-in' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  return_to?: string;
}

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
    private readonly oidc: OidcService,
  ) {}

  private readonly log = new Logger('Auth');

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
    });
  }

  private assertDemo(): void {
    // Indistinguishable from a missing route outside demo mode.
    if (this.config.mode !== 'demo') throw new NotFoundException();
  }

  @Public()
  @Get('auth/config')
  @ApiOperation({ summary: 'Which sign-in methods are available' })
  authConfig() {
    return {
      mode: this.config.mode,
      demoLogin: this.config.mode === 'demo',
      oidc: this.oidc.enabled,
    };
  }

  @Public()
  @Get('auth/login')
  @ApiOperation({ summary: 'Start OIDC sign-in (redirects to the identity provider)' })
  async login(@Query() q: LoginQuery, @Res() res: Response) {
    if (!this.oidc.enabled) throw new NotFoundException();
    try {
      const { url, binding } = await this.oidc.startLogin(q.return_to);
      res.cookie(OIDC_BINDING_COOKIE, binding, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.cookieSecure,
        path: OIDC_COOKIE_PATH,
        maxAge: 10 * 60 * 1000,
      });
      res.redirect(302, url);
    } catch (e) {
      const reason = e instanceof OidcLoginError ? e.reason : 'oidc_unavailable';
      res.redirect(302, `/?login_error=${reason}`);
    }
  }

  @Public()
  @Get('auth/callback')
  @ApiExcludeEndpoint()
  async callback(@Req() req: Request, @Res() res: Response) {
    if (!this.oidc.enabled) throw new NotFoundException();
    const binding = req.cookies?.[OIDC_BINDING_COOKIE] as string | undefined;
    res.clearCookie(OIDC_BINDING_COOKIE, { path: OIDC_COOKIE_PATH });
    const callbackUrl = new URL(req.originalUrl, this.config.publicUrl);
    try {
      const { userId, returnTo } = await this.oidc.finishLogin(callbackUrl, binding);
      const { token } = await this.sessions.create(userId);
      this.setSessionCookie(res, token);
      await this.audit.record(userId, 'auth.login', 'session', null, { method: 'oidc' });
      res.redirect(302, returnTo);
    } catch (e) {
      const reason = e instanceof OidcLoginError ? e.reason : 'idp_error';
      // Detail goes to the server log only (no tokens/codes are included in messages).
      this.log.warn(`OIDC login failed (${reason}): ${e instanceof Error ? e.message : 'unknown'}`);
      await this.audit.record(null, 'auth.login_failed', 'session', null, {
        method: 'oidc',
        reason,
      });
      res.redirect(302, `/?login_error=${reason}`);
    }
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
    this.setSessionCookie(res, token);
    await this.audit.record(u.id, 'auth.login', 'session', null, { method: 'demo' });
  }

  @Post('auth/logout')
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'End the EPI session; returns the identity provider logout URL when OIDC is used',
  })
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await this.audit.record(req.scope.userId, 'auth.logout', 'session', null);
    return { logoutUrl: await this.oidc.logoutUrl() };
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
