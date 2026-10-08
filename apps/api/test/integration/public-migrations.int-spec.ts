import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { applyPublicMigrations, DEFAULT_PUBLIC_MIGRATIONS_DIR, loadPublicMigrations } from '../../src/database/public/public-migrations';

/**
 * The desktop installer applies the Prisma public-schema migrations without
 * the Prisma CLI. Runs them into a throwaway schema (search_path) so the
 * shared test database's real public schema is never touched.
 */
describe('applyPublicMigrations (desktop, no Prisma CLI)', () => {
  const schema = `pm_test_${randomBytes(4).toString('hex')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  let pool: Pool;

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });

  it('applies every migration once, in Prisma’s own bookkeeping format', async () => {
    const files = loadPublicMigrations();
    expect(files.length).toBeGreaterThan(0);

    const first = await applyPublicMigrations(pool);
    expect(first.applied).toEqual(files.map((f) => f.name));

    const { rows } = await pool.query(
      'SELECT migration_name, checksum, finished_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name',
    );
    expect(rows.map((r) => r.migration_name)).toEqual(files.map((f) => f.name));
    for (const [i, row] of rows.entries()) {
      expect(row.checksum).toBe(createHash('sha256').update(files[i]!.sql).digest('hex'));
      expect(row.finished_at).not.toBeNull();
      expect(row.applied_steps_count).toBe(1);
    }
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]);
    expect(tables.rows.map((r) => r.table_name)).toEqual(expect.arrayContaining(['tenants', 'plans']));

    const second = await applyPublicMigrations(pool);
    expect(second.applied).toEqual([]);
  });

  it('rolls back a failing migration and records nothing for it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'erp-pm-'));
    for (const f of loadPublicMigrations(DEFAULT_PUBLIC_MIGRATIONS_DIR)) {
      mkdirSync(join(dir, f.name));
      writeFileSync(join(dir, f.name, 'migration.sql'), f.sql);
    }
    mkdirSync(join(dir, '99999999999999_broken'));
    writeFileSync(join(dir, '99999999999999_broken', 'migration.sql'), 'CREATE TABLE half_done (id int); SELECT * FROM no_such_table;');

    await expect(applyPublicMigrations(pool, dir)).rejects.toThrow(/99999999999999_broken/);
    const half = await pool.query(`SELECT to_regclass('${schema}.half_done') AS t`);
    expect(half.rows[0].t).toBeNull();
    const recorded = await pool.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '99999999999999_broken'`);
    expect(recorded.rowCount).toBe(0);
  });
});
