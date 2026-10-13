import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-user interface language (English or Hebrew); null = follow the browser. */
export class UserLocale1760900000000 implements MigrationInterface {
  name = 'UserLocale1760900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN locale text CHECK (locale IN ('en','he'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users DROP COLUMN locale`);
  }
}
