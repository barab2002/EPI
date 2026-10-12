import { MigrationInterface, QueryRunner } from 'typeorm';

/** Pending OIDC authorization requests (single-use, short-lived, bound to the browser). */
export class OidcLogin1760400000000 implements MigrationInterface {
  name = 'OidcLogin1760400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE oidc_login_requests (
        state_hash text PRIMARY KEY,
        binding_hash text NOT NULL,
        code_verifier text NOT NULL,
        nonce text NOT NULL,
        return_to text NOT NULL DEFAULT '/',
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX oidc_login_requests_expires_idx ON oidc_login_requests(expires_at);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE oidc_login_requests`);
  }
}
