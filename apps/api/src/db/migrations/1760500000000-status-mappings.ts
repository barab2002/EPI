import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-connection mapping of source status IDs to EPI status categories. Rows start as
 * `inferred` (from Jira's built-in status category) and can be confirmed/overridden by an admin
 * (`admin`); syncs never overwrite admin rows. Also: unique connection names and at most one
 * running sync per connection.
 */
export class StatusMappings1760500000000 implements MigrationInterface {
  name = 'StatusMappings1760500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE status_mappings (
        connection_id uuid NOT NULL REFERENCES integration_connections(id),
        source_status_id text NOT NULL,
        source_status_name text NOT NULL,
        category text CHECK (category IN ('TODO','IN_PROGRESS','BLOCKED','REVIEW','QA','DONE')),
        origin text NOT NULL CHECK (origin IN ('inferred','admin')),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (connection_id, source_status_id)
      );
      ALTER TABLE integration_connections ADD CONSTRAINT integration_connections_name_key UNIQUE (name);
      -- At most one running sync per connection (stale runs are expired by the collector).
      CREATE UNIQUE INDEX sync_runs_one_running_idx ON sync_runs(connection_id) WHERE status = 'running';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX sync_runs_one_running_idx;
      ALTER TABLE integration_connections DROP CONSTRAINT integration_connections_name_key;
      DROP TABLE status_mappings;
    `);
  }
}
