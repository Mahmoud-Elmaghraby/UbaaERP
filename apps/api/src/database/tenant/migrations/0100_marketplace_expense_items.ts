import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Ready expense items for marketplace settlements (migration 0099): what a
 * platform keeps from a weekly statement. Commission and delivery fees are
 * selling expenses (524, next to marketing); platform ads go to the
 * existing "تسويق وإعلان". Editable / renamable like any item.
 */
const ITEMS: [string, string][] = [
  ['عمولات المنصات', '524'],
  ['رسوم شحن وتوصيل المنصات', '524'],
];

const migration: TenantMigration = {
  name: '0100_marketplace_expense_items',
  async up(db) {
    for (const [name, code] of ITEMS) {
      await sql`
        INSERT INTO treasury_categories (id, kind, name, chart_of_account_id)
        VALUES (gen_random_uuid(), 'expense', ${name}, (SELECT id FROM chart_of_accounts WHERE code = ${code} AND is_group = FALSE LIMIT 1))
        ON CONFLICT (kind, name) DO NOTHING
      `.execute(db);
    }
  },
};

export default migration;
