import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Customer credit limits (2026-11-05):
 *  - customers.credit_limit_amount: optional limit in minor units of the
 *    customer's default currency (NULL = unlimited).
 *  - tenant_settings.credit_limit_mode: what happens when a sales order is
 *    confirmed / a sales invoice is posted above the limit — 'off' (no check),
 *    'warn' (the screen warns, the action still goes through) or 'block'
 *    (rejected unless the user holds 'sales.override_credit_limit').
 *  - 'sales.override_credit_limit': given to the roles that manage users.
 */
const migration: TenantMigration = {
  name: '0109_customer_credit_limit',
  async up(db) {
    await sql`
      ALTER TABLE customers
      ADD COLUMN credit_limit_amount BIGINT CHECK (credit_limit_amount IS NULL OR credit_limit_amount >= 0)
    `.execute(db);
    await sql`
      ALTER TABLE tenant_settings
      ADD COLUMN credit_limit_mode TEXT NOT NULL DEFAULT 'off' CHECK (credit_limit_mode IN ('off', 'warn', 'block'))
    `.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description)
      VALUES (gen_random_uuid(), 'sales.override_credit_limit', 'Confirm orders / post invoices above a customer''s credit limit')
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'users.manage'
      CROSS JOIN permissions p
      WHERE p.key = 'sales.override_credit_limit'
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
