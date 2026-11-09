import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Granular Sales and Purchases permissions, the same way 0082 split Inventory. 'sales.manage' and
 * 'purchases.manage' each allowed everything in their module, so a cashier could also delete
 * invoices and read every report. Now: view / create (drafts) / post / cancel (and delete) /
 * reports / settings, plus 'pos.use' for selling at the POS.
 *
 * Existing access is preserved exactly: every role that held the old key receives every new key of
 * its module ('sales.manage' also brings 'pos.use'), Owner receives them all, and only then are the
 * old keys removed.
 */
const SALES: [string, string][] = [
  ['sales.view', 'View customers and sales documents'],
  ['sales.create', 'Create and edit customers and draft sales documents'],
  ['sales.post', 'Confirm and post sales documents, receipts, refunds and cheques'],
  ['sales.cancel', 'Cancel and delete sales documents'],
  ['sales.reports.view', 'View sales reports'],
  ['sales.settings.manage', 'Manage price lists, sales channels, sales reps and e-invoice settings'],
  ['pos.use', 'Sell at the point of sale (sessions, checkout, returns, drawer)'],
];

const PURCHASES: [string, string][] = [
  ['purchases.view', 'View suppliers and purchase documents'],
  ['purchases.create', 'Create and edit suppliers and draft purchase documents'],
  ['purchases.post', 'Approve, confirm and post purchase documents and supplier payments'],
  ['purchases.cancel', 'Cancel and delete purchase documents'],
  ['purchases.reports.view', 'View purchase reports'],
  ['purchases.settings.manage', 'Manage supplier price lists'],
];

async function split(db: Parameters<TenantMigration['up']>[0], oldKey: string, keys: [string, string][]) {
  for (const [key, description] of keys) {
    await sql`
      INSERT INTO permissions (id, key, description)
      VALUES (gen_random_uuid(), ${key}, ${description})
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
  }
  const newKeys = keys.map(([key]) => key);
  await sql`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT rp.role_id, p.id
    FROM role_permissions rp
    JOIN permissions old ON old.id = rp.permission_id AND old.key = ${oldKey}
    CROSS JOIN permissions p
    WHERE p.key IN (${sql.join(newKeys)})
    ON CONFLICT DO NOTHING
  `.execute(db);
  await sql`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT ${OWNER_ROLE_ID}::uuid, p.id
    FROM permissions p
    WHERE p.key IN (${sql.join(newKeys)})
      AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
    ON CONFLICT DO NOTHING
  `.execute(db);
  await sql`DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = ${oldKey})`.execute(db);
  await sql`DELETE FROM permissions WHERE key = ${oldKey}`.execute(db);
}

const migration: TenantMigration = {
  name: '0117_trade_permissions',
  async up(db) {
    await split(db, 'sales.manage', SALES);
    await split(db, 'purchases.manage', PURCHASES);
  },
};

export default migration;
