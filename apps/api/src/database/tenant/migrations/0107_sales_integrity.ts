import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Sales audit fixes (audit-02, 2026-11-02):
 *  - POS checkout idempotency: the client sends one id per sale; a retried
 *    request finds the order it already made instead of selling twice.
 *  - 'pos.supervise': close or sell into another cashier's session (each
 *    cashier otherwise only works their own drawer). Given to the roles that
 *    manage users (owners / admins).
 */
const migration: TenantMigration = {
  name: '0107_sales_integrity',
  async up(db) {
    await sql`ALTER TABLE sales_orders ADD COLUMN pos_checkout_id UUID`.execute(db);
    await sql`CREATE UNIQUE INDEX sales_orders_pos_checkout_id_key ON sales_orders (pos_checkout_id) WHERE pos_checkout_id IS NOT NULL`.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description)
      VALUES (gen_random_uuid(), 'pos.supervise', 'Close or sell into another cashier''s POS session')
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'users.manage'
      CROSS JOIN permissions p
      WHERE p.key = 'pos.supervise'
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
