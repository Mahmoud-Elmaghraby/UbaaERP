import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Settings hub phase 2: sales, POS and document-date settings.
 *
 * - The two sales options that lived on tenant_settings move to the central store (app_settings):
 *   credit_limit_mode → 'sales.creditLimitMode', pos_max_discount_percent → 'pos.maxDiscountPercent'.
 *   Only a value someone actually set is copied (a missing row is the default). The old columns are
 *   left in place, unread, so nothing is dropped; a later migration can remove them.
 * - products.min_sale_price_*: the lowest price a product may be sold at (per base unit), checked
 *   by 'sales.belowMinPriceMode'.
 * - Two permissions: 'sales.override_limits' (sell past the discount limit, below cost or the
 *   minimum price, return after the return window) goes to the roles that already hold
 *   'sales.override_credit_limit'; 'documents.backdate' (date a document further back than the
 *   allowed days, or in the future when that's off) goes to the roles holding 'settings.manage'.
 *   Owner gets both.
 */
const PERMISSIONS: [key: string, description: string, grantedWith: string][] = [
  ['sales.override_limits', 'Sell past the discount limit, below cost or the minimum price, and accept late returns', 'sales.override_credit_limit'],
  ['documents.backdate', 'Date documents earlier than the allowed days back, or in the future', 'settings.manage'],
];

const migration: TenantMigration = {
  name: '0120_sales_settings',
  async up(db) {
    await sql`
      INSERT INTO app_settings (key, value)
      SELECT 'sales.creditLimitMode', to_jsonb(credit_limit_mode) FROM tenant_settings
      WHERE credit_limit_mode <> 'off'
      LIMIT 1
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO app_settings (key, value)
      SELECT 'pos.maxDiscountPercent', to_jsonb(pos_max_discount_percent::float8) FROM tenant_settings
      WHERE pos_max_discount_percent IS NOT NULL
      LIMIT 1
      ON CONFLICT (key) DO NOTHING
    `.execute(db);

    await sql`
      ALTER TABLE products
        ADD COLUMN min_sale_price_amount BIGINT,
        ADD COLUMN min_sale_price_currency TEXT,
        ADD CONSTRAINT products_min_sale_price_pair CHECK ((min_sale_price_amount IS NULL) = (min_sale_price_currency IS NULL)),
        ADD CONSTRAINT products_min_sale_price_non_negative CHECK (COALESCE(min_sale_price_amount, 0) >= 0)
    `.execute(db);

    for (const [key, description, grantedWith] of PERMISSIONS) {
      await sql`
        INSERT INTO permissions (id, key, description)
        VALUES (gen_random_uuid(), ${key}, ${description})
        ON CONFLICT (key) DO NOTHING
      `.execute(db);
      await sql`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT DISTINCT rp.role_id, p.id
        FROM role_permissions rp
        JOIN permissions old ON old.id = rp.permission_id AND old.key = ${grantedWith}
        CROSS JOIN permissions p
        WHERE p.key = ${key}
        ON CONFLICT DO NOTHING
      `.execute(db);
      await sql`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ${OWNER_ROLE_ID}::uuid, p.id FROM permissions p
        WHERE p.key = ${key} AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
        ON CONFLICT DO NOTHING
      `.execute(db);
    }
  },
};

export default migration;
