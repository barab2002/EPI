import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { loadConfig } from './config';
import { createDataSource } from './db/data-source';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = new Logger('EPI');
  const ds = await createDataSource(config.databaseUrl).initialize();
  if (await ds.showMigrations()) {
    log.error('Database has pending migrations. Run: node dist/cli.js migrate');
    process.exit(78);
  }
  const app = await createApp(config, ds);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  log.log(
    `EPI listening on :${config.port} (mode=${config.mode}, oidc=${config.oidc ? 'on' : 'off'}); API docs at /api/docs`,
  );
}

main().catch((e: unknown) => {
  console.error('EPI failed to start:', e instanceof Error ? e.message : e);
  process.exit(1);
});
