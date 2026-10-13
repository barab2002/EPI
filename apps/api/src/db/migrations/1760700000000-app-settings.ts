import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Small key/value store for administrator-editable runtime settings (first use: the daily sync
 * schedule). Values are non-secret JSON; secrets stay in files/env referenced by name.
 */
export class AppSettings1760700000000 implements MigrationInterface {
  name = 'AppSettings1760700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE app_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id)
      );
      INSERT INTO app_settings(key, value)
        VALUES ('sync.schedule', '{"enabled": false, "hourLocal": 2, "timezone": "UTC"}');
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE app_settings`);
  }
}
