import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

/**
 * Applies the Prisma `public`-schema migrations (prisma/migrations/<name>/migration.sql)
 * without the Prisma CLI — for the desktop installer, which ships the API's
 * production dependencies only (no `prisma` CLI, no schema engine binary).
 *
 * Bookkeeping is written to Prisma's own `_prisma_migrations` table in
 * Prisma's own format (sha256 checksum of migration.sql, finished_at,
 * applied_steps_count), so a database prepared this way is
 * indistinguishable from one prepared by `prisma migrate deploy` — either
 * tool can take over later. Each migration runs in its own transaction.
 */
export const DEFAULT_PUBLIC_MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'prisma', 'migrations');

export interface PublicMigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function loadPublicMigrations(dir: string = DEFAULT_PUBLIC_MIGRATIONS_DIR): PublicMigrationFile[] {
  if (!existsSync(dir)) throw new Error(`Public migrations directory not found: ${dir}`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

export async function applyPublicMigrations(
  pool: Pool,
  dir: string = DEFAULT_PUBLIC_MIGRATIONS_DIR,
): Promise<{ applied: string[] }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                  VARCHAR(36)  PRIMARY KEY NOT NULL,
      "checksum"            VARCHAR(64)  NOT NULL,
      "finished_at"         TIMESTAMPTZ,
      "migration_name"      VARCHAR(255) NOT NULL,
      "logs"                TEXT,
      "rolled_back_at"      TIMESTAMPTZ,
      "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER      NOT NULL DEFAULT 0
    )`);

  const { rows } = await pool.query<{ migration_name: string; checksum: string; finished_at: Date | null }>(
    `SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  const unfinished = rows.filter((row) => row.finished_at === null);
  if (unfinished.length > 0) {
    throw new Error(
      `Public migration(s) left unfinished by an earlier run: ${unfinished.map((r) => r.migration_name).join(', ')}. ` +
        'Resolve them before applying more.',
    );
  }
  const done = new Map(rows.map((row) => [row.migration_name, row.checksum]));

  const applied: string[] = [];
  for (const migration of loadPublicMigrations(dir)) {
    const previous = done.get(migration.name);
    if (previous !== undefined) {
      if (previous !== migration.checksum) {
        // Same rule as Prisma: an applied migration file must never change.
        console.warn(`[public-migrations] "${migration.name}" was modified after being applied (checksum mismatch).`);
      }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, 1)`,
        [randomUUID(), migration.checksum, migration.name],
      );
      await client.query('COMMIT');
      applied.push(migration.name);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Public migration "${migration.name}" failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return { applied };
}
