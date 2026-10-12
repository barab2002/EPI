import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identity mapping support (EPI-008): source accounts seen during syncs (for the mapping screen)
 * and external IDs on synced records so a mapping made later re-attributes existing data.
 */
export class SourceAccounts1760600000000 implements MigrationInterface {
  name = 'SourceAccounts1760600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE source_accounts (
        source text NOT NULL CHECK (source IN ('jira','gitlab')),
        external_id text NOT NULL,
        display_name text,
        is_bot boolean NOT NULL DEFAULT false,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (source, external_id)
      );
      ALTER TABLE work_items ADD COLUMN assignee_external_id text;
      CREATE INDEX work_items_assignee_ext_idx ON work_items(assignee_external_id);
      ALTER TABLE merge_requests ADD COLUMN author_external_id text;
      CREATE INDEX merge_requests_author_ext_idx ON merge_requests(author_external_id);
      CREATE INDEX review_events_actor_ext_idx ON review_events(actor_external_id);
      CREATE UNIQUE INDEX external_identities_user_source_idx ON external_identities(user_id, source);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX external_identities_user_source_idx;
      DROP INDEX review_events_actor_ext_idx;
      DROP INDEX merge_requests_author_ext_idx;
      ALTER TABLE merge_requests DROP COLUMN author_external_id;
      DROP INDEX work_items_assignee_ext_idx;
      ALTER TABLE work_items DROP COLUMN assignee_external_id;
      DROP TABLE source_accounts;
    `);
  }
}
