import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { correlationMiddleware } from './common/correlation';
import { EpiConfig } from './config';

export const API_VERSION = '0.1.0';

/** Builds the Nest app (shared by main.ts and integration tests). */
export async function createApp(
  config: EpiConfig,
  dataSource: DataSource,
  opts: { logger?: false } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config, dataSource),
    { logger: opts.logger === false ? false : ['error', 'warn', 'log'] },
  );
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(correlationMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Swagger UI needs inline styles; scripts stay same-origin only. No external sources.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': config.cookieSecure ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EPI API')
      .setDescription(
        'Engineering Performance & Improvement. All data routes are scope-filtered server-side.',
      )
      .setVersion(API_VERSION)
      .addCookieAuth('epi_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' });

  // Serve the single EPI UI from the same origin; unknown non-API paths fall back to index.html.
  if (config.webDist && existsSync(join(config.webDist, 'index.html'))) {
    app.useStaticAssets(config.webDist, { index: false, maxAge: '1h' });
    const indexHtml = join(config.webDist, 'index.html');
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/health')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }
  return app;
}
