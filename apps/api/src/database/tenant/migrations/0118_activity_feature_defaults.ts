import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Activity options (feature-catalog.ts, 2026-11-09): marketplaces, installments, sales reps,
 * cheques, POS, landed costs, fixed assets, budgets. Each is switched OFF for a tenant that has
 * never used it — a brand-new tenant starts with a short menu, while a tenant that already sells on
 * Jumia or runs a POS keeps exactly what it uses. A tenant that already set a switch keeps its
 * choice (ON CONFLICT DO NOTHING). Off only blocks new records; nothing is deleted.
 */
const UNUSED_WHEN: [string, string][] = [
  ['sales.channels', 'SELECT 1 FROM sales_channels'],
  ['sales.installments', 'SELECT 1 FROM sales_invoice_installments'],
  ['sales.reps', 'SELECT 1 FROM sales_reps'],
  ['cheques', "SELECT 1 FROM payments_received WHERE payment_method = 'check' UNION ALL SELECT 1 FROM supplier_payments WHERE payment_method = 'check'"],
  ['pos', 'SELECT 1 FROM pos_sessions'],
  ['inventory.landed_costs', 'SELECT 1 FROM landed_costs'],
  ['fixed_assets', 'SELECT 1 FROM fixed_assets'],
  ['budgets', 'SELECT 1 FROM budgets'],
];

const migration: TenantMigration = {
  name: '0118_activity_feature_defaults',
  async up(db) {
    for (const [key, usedQuery] of UNUSED_WHEN) {
      await sql`
        INSERT INTO tenant_feature_toggles (feature_key, enabled, updated_at)
        SELECT ${key}, false, now()
        WHERE NOT EXISTS (${sql.raw(usedQuery)})
        ON CONFLICT (feature_key) DO NOTHING
      `.execute(db);
    }
  },
};

export default migration;
