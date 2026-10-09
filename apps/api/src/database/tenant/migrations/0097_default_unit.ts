import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * The unit a new product gets when none is chosen (Inventory settings). A
 * clothing shop never sees a unit field; a grocery picks "كجم" once here.
 * Backfilled with the seeded "قطعة" (migration 0086), else the oldest
 * active unit.
 */
const migration: TenantMigration = {
  name: '0097_default_unit',
  async up(db) {
    await sql`
      ALTER TABLE inventory_settings
        ADD COLUMN default_unit_of_measure_id UUID REFERENCES units_of_measure (id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      UPDATE inventory_settings SET default_unit_of_measure_id = (
        SELECT id FROM units_of_measure
        WHERE is_active
        ORDER BY (name = 'قطعة') DESC, created_at
        LIMIT 1
      )
    `.execute(db);
  },
};

export default migration;
