import 'reflect-metadata';
import { loadConfig } from './config';
import { createDataSource } from './db/data-source';
import { hasDemoData, seedDemo } from './seed/demo-seed';

/* eslint-disable no-console */
const USAGE = 'Usage: node dist/cli.js <migrate|seed-demo|status>';

async function main(cmd: string | undefined): Promise<number> {
  if (!cmd || !['migrate', 'seed-demo', 'status'].includes(cmd)) {
    console.error(USAGE);
    return 64;
  }
  const config = loadConfig();
  const ds = await createDataSource(config.databaseUrl).initialize();
  try {
    if (cmd === 'migrate') {
      const ran = await ds.runMigrations({ transaction: 'each' });
      console.log(
        `migrate: applied ${ran.length} migration(s)${ran.length ? ': ' + ran.map((m) => m.name).join(', ') : ''}`,
      );
    } else if (cmd === 'seed-demo') {
      if (config.mode !== 'demo') {
        console.error('seed-demo: refused — synthetic data may only be loaded with EPI_MODE=demo');
        return 78;
      }
      if (await hasDemoData(ds)) {
        console.log('seed-demo: synthetic data already present, skipping');
      } else {
        const s = await seedDemo(ds, new Date());
        console.log(
          `seed-demo: created ${s.users} users, ${s.teams} teams, ${s.workItems} work items, ${s.mergeRequests} MRs (all synthetic)`,
        );
      }
    } else {
      const pending = await ds.showMigrations();
      console.log(`status: database reachable; pending migrations: ${pending ? 'yes' : 'no'}`);
    }
    return 0;
  } finally {
    await ds.destroy();
  }
}

main(process.argv[2]).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(
      `${process.argv[2] ?? 'cli'}: failed — ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  },
);
