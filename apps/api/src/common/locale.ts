import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type Locale = 'en' | 'he';

/**
 * Language of server texts for one request (ADR-035): `?lang=en|he` (the web client passes the
 * language it shows), else the first supported Accept-Language entry, else English.
 */
export function pickLocale(lang: unknown, acceptLanguage: string | undefined): Locale {
  if (lang === 'he' || lang === 'en') return lang;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag === 'he' || tag.startsWith('he-') || tag === 'iw') return 'he';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}

export const RequestLocale = createParamDecorator((_: unknown, ctx: ExecutionContext): Locale => {
  const req = ctx.switchToHttp().getRequest<{
    query?: Record<string, unknown>;
    headers: Record<string, string | undefined>;
  }>();
  return pickLocale(req.query?.lang, req.headers['accept-language']);
});
