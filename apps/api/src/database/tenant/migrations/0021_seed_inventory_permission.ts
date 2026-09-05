import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends the fixed permission catalog (see 0007) with Inventory's single
 * gating permission, mirroring Settings' one-permission-per-module pattern
 * ('settings.manage') rather than splitting into separate view/manage keys.
 */
const migration: TenantMigration = {
  name: '0021_seed_inventory_permission',
  async up(db) {
    await sql`
      INSERT INTO permissions (id, key, description) VALUES
        (gen_random_uuid(), 'inventory.manage', 'Manage products, variants, warehouses, units of measure, and stock movements')
    `.execute(db);
  },
};

export default migration;
