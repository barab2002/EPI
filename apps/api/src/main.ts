import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { loadConfig } from './config';
import { createDataSource } from './db/data-source';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = new Logger('EPI');
  if (config.mode === 'production') {
    // Honest failure: OIDC login (EPI-003) is not implemented yet, so production mode would have
    // no way to sign in. Refuse to start rather than run without authentication.
    log.error(
      'Production mode requires Keycloak OIDC login (backlog EPI-003), which is not implemented yet. Use EPI_MODE=demo with synthetic data.',
    );
    process.exit(78);
  }
  const ds = await createDataSource(config.databaseUrl).initialize();
  if (await ds.showMigrations()) {
    log.error('Database has pending migrations. Run: node dist/cli.js migrate');
    process.exit(78);
  }
  const app = await createApp(config, ds);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  log.log(`EPI listening on :${config.port} (mode=${config.mode}); API docs at /api/docs`);
}

main().catch((e: unknown) => {
  console.error('EPI failed to start:', e instanceof Error ? e.message : e);
  process.exit(1);
});
