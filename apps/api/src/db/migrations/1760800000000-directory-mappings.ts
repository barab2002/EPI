import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AD team import (EPI-004c): which directory team group feeds which EPI team. Only mapped teams
 * are managed by the import; people imported from the directory are linked through
 * external_identities(source = 'directory', external_id = objectGUID/entryUUID).
 */
export class DirectoryMappings1760800000000 implements MigrationInterface {
  name = 'DirectoryMappings1760800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE directory_team_mappings (
        group_dn text PRIMARY KEY,
        team_id uuid REFERENCES teams(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id)
      );
      CREATE UNIQUE INDEX external_identities_one_directory_per_user
        ON external_identities(user_id) WHERE source = 'directory';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX external_identities_one_directory_per_user;
      DROP TABLE directory_team_mappings;
    `);
  }
}
