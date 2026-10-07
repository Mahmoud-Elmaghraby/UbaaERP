import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * A new tenant could not create its first item: no unit of measure existed
 * (found while verifying inventory step 4 end to end). Daftra and Odoo ship
 * a starter list; so do we — only into an EMPTY table, so a tenant that
 * already defined its own units is left alone. Names are unique (0015);
 * every row is an ordinary, editable unit.
 */
const UNITS: [string, string][] = [
  ['قطعة', 'قطعة'],
  ['كيلوجرام', 'كجم'],
  ['جرام', 'جم'],
  ['لتر', 'لتر'],
  ['متر', 'م'],
  ['علبة', 'علبة'],
  ['كرتونة', 'كرتونة'],
  ['خدمة', 'خدمة'],
];

const migration: TenantMigration = {
  name: '0086_seed_default_units',
  async up(db) {
    const existing = await sql<{ count: string }>`SELECT COUNT(*)::text AS count FROM units_of_measure`.execute(db);
    if (Number(existing.rows[0]?.count ?? '0') > 0) return;
    for (const [name, symbol] of UNITS) {
      await sql`
        INSERT INTO units_of_measure (id, name, symbol, is_active)
        VALUES (gen_random_uuid(), ${name}, ${symbol}, TRUE)
      `.execute(db);
    }
  },
};

export default migration;
