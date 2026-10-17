import { katax } from 'katax-service-manager';
import type { ISqlDatabase } from 'katax-service-manager';
import type { PoolClient } from 'pg';

/**
 * Typed accessor for the 'main' PostgreSQL connection. Every repository
 * calls this instead of touching `katax.db()` directly, so the return type
 * (`ISqlDatabase`, with a generic `query<T>()`) is consistent everywhere.
 *
 * `katax.db(name)` is publicly typed as the broader `IDatabaseService`
 * (whose `query` is optional, to also cover Mongo/Redis connections); the
 * 'main' connection is always configured as PostgreSQL in src/index.ts, so
 * narrowing to `ISqlDatabase` here is safe.
 */
export function db(): ISqlDatabase {
  return katax.db('main') as unknown as ISqlDatabase;
}

/** Query surface handed to the callback of `withTransaction` (returns rows, like `db().query`). */
export interface Tx {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

/**
 * Runs `fn` inside a single transaction on a dedicated pooled client.
 * Commits on success, rolls back (and rethrows) on any error, and always
 * releases the client.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = (await db().getClient()) as PoolClient;
  try {
    await client.query('BEGIN');
    const tx: Tx = {
      query: async <R>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as R
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
