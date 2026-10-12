import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial EPI schema (spec §6), pilot subset. Phase 2 tables (competencies, goals, sprint
 * commitments) arrive in later migrations. `is_synthetic` marks demo data so the UI can label it.
 */
export class InitialSchema1760300000000 implements MigrationInterface {
  name = 'InitialSchema1760300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL
      );
      CREATE TABLE org_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        name text NOT NULL
      );
      CREATE TABLE teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id uuid NOT NULL REFERENCES org_groups(id),
        name text NOT NULL,
        active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_sub text UNIQUE,
        display_name text NOT NULL,
        email text,
        active boolean NOT NULL DEFAULT true,
        is_synthetic boolean NOT NULL DEFAULT false
      );
      CREATE TABLE team_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        team_id uuid NOT NULL REFERENCES teams(id),
        effective_from timestamptz NOT NULL,
        effective_to timestamptz,
        CHECK (effective_to IS NULL OR effective_to > effective_from)
      );
      CREATE INDEX team_memberships_team_idx ON team_memberships(team_id, effective_from);
      CREATE INDEX team_memberships_user_idx ON team_memberships(user_id, effective_from);

      CREATE TYPE epi_role AS ENUM
        ('DEVELOPER','TEAM_LEAD','GROUP_MANAGER','ENGINEERING_MANAGER','ADMIN','HR_PARTNER');
      CREATE TYPE epi_scope AS ENUM ('ORGANIZATION','GROUP','TEAM','SELF','SYSTEM');
      CREATE TABLE role_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        role epi_role NOT NULL,
        scope_type epi_scope NOT NULL,
        scope_id uuid,
        effective_from timestamptz NOT NULL DEFAULT now(),
        effective_to timestamptz,
        CHECK ((scope_type IN ('SELF','SYSTEM')) = (scope_id IS NULL))
      );
      CREATE INDEX role_assignments_user_idx ON role_assignments(user_id);

      CREATE TABLE professional_grades (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        label text NOT NULL,
        ordinal int NOT NULL
      );
      CREATE TABLE grade_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        grade_id uuid NOT NULL REFERENCES professional_grades(id),
        effective_from timestamptz NOT NULL,
        effective_to timestamptz,
        experience_months_at_start int
      );
      CREATE TABLE external_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        source text NOT NULL,
        external_id text NOT NULL,
        verified boolean NOT NULL DEFAULT false,
        UNIQUE (source, external_id)
      );

      CREATE TABLE integration_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL CHECK (kind IN ('jira','gitlab','synthetic')),
        name text NOT NULL,
        endpoint text,
        enabled boolean NOT NULL DEFAULT true,
        config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        secret_ref text
      );
      CREATE TABLE sync_cursors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id uuid NOT NULL REFERENCES integration_connections(id),
        resource text NOT NULL,
        cursor text,
        last_success_at timestamptz,
        UNIQUE (connection_id, resource)
      );
      CREATE TABLE sync_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id uuid NOT NULL REFERENCES integration_connections(id),
        started_at timestamptz NOT NULL,
        finished_at timestamptz,
        status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
        counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_summary text
      );

      CREATE TABLE work_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id uuid NOT NULL REFERENCES integration_connections(id),
        external_key text NOT NULL,
        project_key text NOT NULL,
        title text,
        issue_type text NOT NULL,
        work_type text NOT NULL,
        assignee_user_id uuid REFERENCES users(id),
        complexity_class text NOT NULL DEFAULT 'UNKNOWN' CHECK (complexity_class IN ('S','M','L','UNKNOWN')),
        story_points numeric,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        started_at timestamptz,
        done_at timestamptz,
        updated_at timestamptz NOT NULL,
        raw_json jsonb,
        is_synthetic boolean NOT NULL DEFAULT false,
        UNIQUE (connection_id, external_key)
      );
      CREATE INDEX work_items_assignee_idx ON work_items(assignee_user_id, done_at);
      CREATE TABLE work_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        external_event_id text NOT NULL,
        field_name text NOT NULL,
        old_value text,
        new_value text,
        status_category text CHECK (status_category IN ('TODO','IN_PROGRESS','BLOCKED','REVIEW','QA','DONE')),
        event_at timestamptz NOT NULL,
        UNIQUE (work_item_id, external_event_id, field_name)
      );
      CREATE INDEX work_events_item_idx ON work_events(work_item_id, event_at);

      CREATE TABLE merge_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id uuid NOT NULL REFERENCES integration_connections(id),
        project_external_id text NOT NULL,
        mr_iid text NOT NULL,
        title text,
        author_user_id uuid REFERENCES users(id),
        linked_work_item_id uuid REFERENCES work_items(id),
        link_confidence text,
        created_at timestamptz NOT NULL,
        merged_at timestamptz,
        state text NOT NULL,
        raw_json jsonb,
        is_synthetic boolean NOT NULL DEFAULT false,
        UNIQUE (connection_id, project_external_id, mr_iid)
      );
      CREATE INDEX merge_requests_created_idx ON merge_requests(created_at);
      CREATE TABLE review_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merge_request_id uuid NOT NULL REFERENCES merge_requests(id) ON DELETE CASCADE,
        external_event_id text NOT NULL,
        event_type text NOT NULL CHECK (event_type IN ('review_requested','note','approval','system_note')),
        actor_user_id uuid REFERENCES users(id),
        actor_external_id text,
        is_bot boolean NOT NULL DEFAULT false,
        event_at timestamptz NOT NULL,
        raw_json jsonb,
        UNIQUE (merge_request_id, external_event_id)
      );
      CREATE INDEX review_events_mr_idx ON review_events(merge_request_id, event_at);

      CREATE TABLE review_cycles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        period_start date NOT NULL,
        period_end date NOT NULL,
        status text NOT NULL CHECK (status IN ('open','closed')),
        review_type text NOT NULL DEFAULT 'monthly',
        UNIQUE (period_start, review_type)
      );
      CREATE TABLE assessments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id uuid NOT NULL REFERENCES review_cycles(id),
        subject_user_id uuid NOT NULL REFERENCES users(id),
        reviewer_user_id uuid NOT NULL REFERENCES users(id),
        independence_1to5 smallint NOT NULL CHECK (independence_1to5 BETWEEN 1 AND 5),
        growth_1to5 smallint NOT NULL CHECK (growth_1to5 BETWEEN 1 AND 5),
        evidence text NOT NULL CHECK (length(trim(evidence)) >= 20),
        status text NOT NULL CHECK (status IN ('draft','submitted')),
        submitted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (subject_user_id <> reviewer_user_id),
        UNIQUE (cycle_id, subject_user_id, reviewer_user_id)
      );

      CREATE TABLE kpi_definitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        version text NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        formula_text text NOT NULL,
        direction text NOT NULL,
        scope text NOT NULL,
        minimum_sample int NOT NULL,
        active boolean NOT NULL DEFAULT true,
        UNIQUE (code, version)
      );
      CREATE TABLE kpi_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        kpi_code text NOT NULL,
        formula_version text NOT NULL,
        value numeric,
        unit text NOT NULL,
        sample_size int NOT NULL,
        confidence text NOT NULL,
        provisional boolean NOT NULL DEFAULT false,
        calculated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (entity_type, entity_id, period_start, period_end, kpi_code, formula_version)
      );

      CREATE TABLE audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid REFERENCES users(id),
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id text,
        at timestamptz NOT NULL DEFAULT now(),
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX audit_events_at_idx ON audit_events(at DESC);

      CREATE TABLE sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id),
        csrf_token text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE sessions, audit_events, kpi_snapshots, kpi_definitions, assessments, review_cycles,
        review_events, merge_requests, work_events, work_items, sync_runs, sync_cursors,
        integration_connections, external_identities, grade_history, professional_grades,
        role_assignments, team_memberships, users, teams, org_groups, organizations;
      DROP TYPE epi_scope; DROP TYPE epi_role;
    `);
  }
}
