import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Granular Inventory permissions (inventory completion, step 4). Replaces
 * the single 'inventory.manage' (0021) so a tenant can give a store keeper
 * counting and transfers without costs, or let a clerk prepare a stocktake
 * that only a manager may post.
 *
 * Existing access is preserved exactly: every role that held
 * 'inventory.manage' receives every new key, and Owner receives them all
 * regardless. Only then is 'inventory.manage' removed (role_permissions
 * rows go with it through the FK's ON DELETE CASCADE, or explicitly below
 * when the FK doesn't cascade).
 */
const PERMISSIONS: [string, string][] = [
  ['inventory.products.view', 'View items, variants, units, categories and brands'],
  ['inventory.products.manage', 'Create, edit, import and delete items, their units, barcodes and images'],
  ['inventory.costs.view', 'See item costs, stock value and valuation'],
  ['inventory.stock.view', 'View stock levels, lots and stock movements'],
  ['inventory.movements.manage', 'Record manual stock adjustments and reorder points'],
  ['inventory.transfers.manage', 'Create and edit warehouse transfer drafts'],
  ['inventory.transfers.approve', 'Dispatch and receive warehouse transfers'],
  ['inventory.counts.manage', 'Prepare stocktakes and opening balances'],
  ['inventory.counts.post', 'Post stocktakes and opening balances'],
  ['inventory.landed_costs.manage', 'Apply landed costs'],
  ['inventory.reports.view', 'View inventory reports'],
  ['inventory.settings.manage', 'Manage warehouses, units of measure, adjustment reasons and inventory settings'],
];

const migration: TenantMigration = {
  name: '0082_inventory_permissions',
  async up(db) {
    for (const [key, description] of PERMISSIONS) {
      await sql`
        INSERT INTO permissions (id, key, description)
        VALUES (gen_random_uuid(), ${key}, ${description})
        ON CONFLICT (key) DO NOTHING
      `.execute(db);
    }

    // Roles that could do everything in Inventory keep being able to.
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'inventory.manage'
      CROSS JOIN permissions p
      WHERE p.key LIKE 'inventory.%' AND p.key <> 'inventory.manage'
      ON CONFLICT DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, p.id
      FROM permissions p
      WHERE p.key LIKE 'inventory.%' AND p.key <> 'inventory.manage'
        AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    await sql`
      DELETE FROM role_permissions
      WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'inventory.manage')
    `.execute(db);
    await sql`DELETE FROM permissions WHERE key = 'inventory.manage'`.execute(db);
  },
};

export default migration;
