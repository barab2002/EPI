import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Scope, ScopeService } from '../org/scope.service';
import { SessionService } from './session.service';

export const SESSION_COOKIE = 'epi_session';
export const CSRF_HEADER = 'x-csrf-token';
const IS_PUBLIC = 'epi:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest extends Request {
  scope: Scope;
  csrfToken: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Global guard: every route requires a valid session unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly scopes: ScopeService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.sessions.touch(req.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('Not signed in or session expired');
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.header(CSRF_HEADER) ?? '';
      if (!sameToken(header, session.csrfToken)) {
        throw new ForbiddenException('Missing or invalid CSRF token');
      }
    }
    req.scope = await this.scopes.resolve(session.userId);
    req.csrfToken = session.csrfToken;
    return true;
  }
}
