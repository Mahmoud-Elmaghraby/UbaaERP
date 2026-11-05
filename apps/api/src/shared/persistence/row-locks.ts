import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/**
 * Locks rows (FOR UPDATE, in id order so two transactions never deadlock on
 * the same set) until the surrounding transaction ends. Used to re-check a
 * quantity or balance at post/confirm time: two drafts on the same order line
 * are serialized, so the second one sees what the first one posted.
 * Must be called inside a transaction.
 */
export async function lockRowsForUpdate(
  db: Kysely<TenantDatabase>,
  table: keyof TenantDatabase & string,
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  await sql`SELECT 1 FROM ${sql.table(table)} WHERE id = ANY(${unique}::uuid[]) ORDER BY id FOR UPDATE`.execute(db);
}
