import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Settings' "General" tab has, until now, carried only currencyCode.
 * Competitive research (claude/competitive-differentiation-strategy.md,
 * 2026-09-12) confirmed this is genuinely below the baseline every
 * comparator ships — company name, address, and a tax/VAT registration
 * number are day-one setup fields everywhere (Odoo, SAP B1, Daftra, Wafeq
 * all collect them in initial account setup), not advanced/optional config.
 *
 * All three columns are nullable: every tenant already has a settings row
 * (migration 0001's singleton), so there is no way to backfill these with a
 * real value, and a tenant shouldn't be blocked from using the product
 * while an admin hasn't typed the company's tax number in yet.
 */
const migration: TenantMigration = {
  name: '0070_add_company_profile_to_tenant_settings',
  async up(db) {
    await sql`
      ALTER TABLE tenant_settings
        ADD COLUMN company_name TEXT,
        ADD COLUMN address TEXT,
        ADD COLUMN tax_registration_number TEXT
    `.execute(db);
  },
};

export default migration;
