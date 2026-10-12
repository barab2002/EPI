import type { DataSource, EntityManager } from 'typeorm';

/**
 * Runs a query and always returns the result rows. TypeORM's postgres driver returns
 * `[rows, affectedCount]` for UPDATE/DELETE … RETURNING but plain `rows` for SELECT/INSERT;
 * reading the wrong shape silently yields `undefined` fields, so all writes with RETURNING
 * must go through this helper.
 */
export async function rows<T>(
  db: DataSource | EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result: unknown = await db.query(sql, params);
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  if (!Array.isArray(result)) throw new Error('Unexpected query result shape');
  return result as T[];
}
