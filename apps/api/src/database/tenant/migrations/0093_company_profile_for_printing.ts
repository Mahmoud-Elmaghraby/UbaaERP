import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Printing (central print service): the company header every printed
 * document carries — commercial register, phone, email, website and the
 * logo (object storage key, see shared/storage). Name, address and tax
 * registration number already existed.
 */
const migration: TenantMigration = {
  name: '0093_company_profile_for_printing',
  async up(db) {
    await sql`
      ALTER TABLE tenant_settings
        ADD COLUMN commercial_register TEXT,
        ADD COLUMN phone TEXT,
        ADD COLUMN email TEXT,
        ADD COLUMN website TEXT,
        ADD COLUMN logo_object_key TEXT
    `.execute(db);
  },
};

export default migration;
