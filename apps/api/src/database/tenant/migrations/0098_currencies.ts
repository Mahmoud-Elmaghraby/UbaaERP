import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Currencies the tenant works with (Settings › Currencies): the company
 * currency and every currency a document, treasury or party may use are
 * picked from here instead of typed. Seeded with the region's common ones;
 * the tenant's current currency is always present and active.
 */
const migration: TenantMigration = {
  name: '0098_currencies',
  async up(db) {
    await sql`
      CREATE TABLE currencies (
        code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      INSERT INTO currencies (code, name, symbol, is_active) VALUES
        ('EGP', 'جنيه مصري', 'ج.م', true),
        ('USD', 'دولار أمريكي', '$', true),
        ('EUR', 'يورو', '€', true),
        ('SAR', 'ريال سعودي', 'ر.س', false),
        ('AED', 'درهم إماراتي', 'د.إ', false),
        ('GBP', 'جنيه إسترليني', '£', false),
        ('CNY', 'يوان صيني', '¥', false),
        ('TRY', 'ليرة تركية', '₺', false)
    `.execute(db);
    // Whatever the tenant already uses (company currency, parties, treasuries) stays usable.
    await sql`
      INSERT INTO currencies (code, name, symbol)
      SELECT DISTINCT code, code, code FROM (
        SELECT currency_code AS code FROM tenant_settings
        UNION SELECT default_currency FROM customers
        UNION SELECT default_currency FROM suppliers
        UNION SELECT currency FROM treasuries
      ) used
      WHERE code ~ '^[A-Z]{3}$'
      ON CONFLICT (code) DO UPDATE SET is_active = true
    `.execute(db);
  },
};

export default migration;
