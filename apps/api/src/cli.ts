import 'reflect-metadata';
import { loadConfig } from './config';
import { createDataSource } from './db/data-source';
import { checkJiraConnection, JiraSync } from './ingestion/jira/jira.sync';
import { hasDemoData, seedDemo } from './seed/demo-seed';

/* eslint-disable no-console */
const USAGE = `Usage: node dist/cli.js <command> [options]
  migrate                         apply pending database migrations
  status                          database reachability and pending migrations
  seed-demo                       load SYNTHETIC demo data (EPI_MODE=demo only)
  jira-add --name N --url URL --projects KEY[,KEY] [--secret-ref EPI_JIRA_TOKEN]
           [--story-points auto|customfield_NNNNN|none] [--backfill-months 6] [--allow-http]
                                  create or update a read-only Jira DC connection
  jira-check --name N             verify access: version, statuses, Story Points field, issue count
  jira-sync --name N [--full]     run a sync (incremental; --full re-reads the backfill window)`;

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

function required(args: Record<string, string | true>, name: string): string {
  const v = args[name];
  if (typeof v !== 'string' || !v) throw new Error(`--${name} is required`);
  return v;
}

const COMMANDS = ['migrate', 'seed-demo', 'status', 'jira-add', 'jira-check', 'jira-sync'];

async function main(cmd: string | undefined, rest: string[]): Promise<number> {
  if (!cmd || !COMMANDS.includes(cmd)) {
    console.error(USAGE);
    return 64;
  }
  const args = parseArgs(rest);
  const config = loadConfig();
  const ds = await createDataSource(config.databaseUrl).initialize();
  try {
    switch (cmd) {
      case 'migrate': {
        const ran = await ds.runMigrations({ transaction: 'each' });
        console.log(
          `migrate: applied ${ran.length} migration(s)${ran.length ? ': ' + ran.map((m) => m.name).join(', ') : ''}`,
        );
        return 0;
      }
      case 'seed-demo': {
        if (config.mode !== 'demo') {
          console.error(
            'seed-demo: refused — synthetic data may only be loaded with EPI_MODE=demo',
          );
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
        return 0;
      }
      case 'status': {
        const pending = await ds.showMigrations();
        console.log(`status: database reachable; pending migrations: ${pending ? 'yes' : 'no'}`);
        return 0;
      }
      case 'jira-add': {
        const name = required(args, 'name');
        const url = new URL(required(args, 'url'));
        if (url.protocol !== 'https:' && args['allow-http'] !== true) {
          throw new Error('Jira URL must use https (use --allow-http only for local test servers)');
        }
        const projectKeys = required(args, 'projects')
          .split(',')
          .map((k) => k.trim().toUpperCase());
        const sp = typeof args['story-points'] === 'string' ? args['story-points'] : 'auto';
        const cfg = {
          projectKeys,
          storyPointsField: sp === 'none' ? null : sp,
          backfillMonths: Number(args['backfill-months'] ?? 6),
        };
        const secretRef =
          typeof args['secret-ref'] === 'string' ? args['secret-ref'] : 'EPI_JIRA_TOKEN';
        await ds.query(
          `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref)
           VALUES ('jira', $1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET endpoint = EXCLUDED.endpoint,
             config_json = EXCLUDED.config_json, secret_ref = EXCLUDED.secret_ref`,
          [name, url.origin + url.pathname.replace(/\/+$/, ''), JSON.stringify(cfg), secretRef],
        );
        await ds.query(
          `INSERT INTO audit_events(action, resource_type, resource_id, metadata_json)
           VALUES ('integration.upsert', 'integration_connection', $1, $2)`,
          [name, JSON.stringify({ kind: 'jira', projectKeys, via: 'cli' })],
        );
        console.log(
          `jira-add: connection "${name}" saved (projects ${projectKeys.join(', ')}). Provide the token via ${secretRef}_FILE, then run jira-check.`,
        );
        return 0;
      }
      case 'jira-check': {
        const r = await checkJiraConnection(ds, required(args, 'name'));
        console.log(
          `Jira ${r.version}${r.deploymentType ? ` (${r.deploymentType})` : ''}: reachable, token accepted`,
        );
        console.log(`  statuses visible: ${r.statuses}`);
        console.log(
          `  Story Points field: ${r.storyPoints.fieldId ?? 'not determined'}${r.storyPoints.candidates.length > 1 ? ` (candidates: ${r.storyPoints.candidates.join(', ')} — confirm with --story-points)` : ''}`,
        );
        console.log(`  issues in backfill window: ${r.matchingIssues}`);
        return 0;
      }
      case 'jira-sync': {
        const r = await new JiraSync(ds).run(required(args, 'name'), {
          fullBackfill: args.full === true,
        });
        console.log(`jira-sync: ${r.status} (run ${r.runId})`);
        console.log(JSON.stringify(r.counts, null, 2));
        if (r.error) console.error(`jira-sync: ${r.error}`);
        return r.status === 'succeeded' ? 0 : 1;
      }
    }
    return 64;
  } finally {
    await ds.destroy();
  }
}

main(process.argv[2], process.argv.slice(3)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(
      `${process.argv[2] ?? 'cli'}: failed — ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  },
);
