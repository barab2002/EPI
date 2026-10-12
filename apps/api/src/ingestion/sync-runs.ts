import { DataSource } from 'typeorm';

/** Shared sync-run bookkeeping for all collectors (spec §7: failed sync never advances cursor). */

export class SyncAlreadyRunningError extends Error {
  constructor(connectionName: string) {
    super(`A sync for "${connectionName}" is already running`);
  }
}

/**
 * Starts a run: expires runs abandoned for over 2 h, then inserts a 'running' row. The partial
 * unique index `sync_runs_one_running_idx` guarantees one running sync per connection.
 */
export async function startRun(
  ds: DataSource,
  connectionId: string,
  connectionName: string,
  now: Date,
): Promise<string> {
  await ds.query(
    `UPDATE sync_runs SET status = 'failed', finished_at = now(), error_summary = 'abandoned (no finish recorded)'
     WHERE connection_id = $1 AND status = 'running' AND started_at < now() - interval '2 hours'`,
    [connectionId],
  );
  try {
    const [run] = await ds.query(
      `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, $2, 'running') RETURNING id`,
      [connectionId, now],
    );
    return run.id;
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new SyncAlreadyRunningError(connectionName);
    throw e;
  }
}

export async function lastSuccess(
  ds: DataSource,
  connectionId: string,
  resource: string,
): Promise<Date | null> {
  const [c] = await ds.query(
    `SELECT last_success_at FROM sync_cursors WHERE connection_id = $1 AND resource = $2`,
    [connectionId, resource],
  );
  return c?.last_success_at ? new Date(c.last_success_at) : null;
}

/** Records success and advances the cursor to the run's start time, atomically. */
export async function succeedRun(
  ds: DataSource,
  runId: string,
  connectionId: string,
  resource: string,
  startedAt: Date,
  counts: object,
): Promise<void> {
  await ds.transaction(async (m) => {
    await m.query(
      `INSERT INTO sync_cursors(connection_id, resource, cursor, last_success_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (connection_id, resource) DO UPDATE
         SET cursor = EXCLUDED.cursor, last_success_at = EXCLUDED.last_success_at`,
      [connectionId, resource, startedAt.toISOString(), startedAt],
    );
    await m.query(
      `UPDATE sync_runs SET status = 'succeeded', finished_at = now(), counts_json = $2 WHERE id = $1`,
      [runId, JSON.stringify(counts)],
    );
  });
}

/** Records failure; the cursor is untouched. Returns the sanitized error message. */
export async function failRun(
  ds: DataSource,
  runId: string,
  counts: object,
  e: unknown,
): Promise<string> {
  // Messages from our HTTP layer never include credentials or query strings.
  const error = (e instanceof Error ? e.message : 'unknown error').slice(0, 500);
  await ds.query(
    `UPDATE sync_runs SET status = 'failed', finished_at = now(), counts_json = $2, error_summary = $3
     WHERE id = $1`,
    [runId, JSON.stringify(counts), error],
  );
  return error;
}
