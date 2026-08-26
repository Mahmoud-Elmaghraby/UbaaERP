import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * tax_rules (master doc §16.1: "fully definable taxes"). `rate` is a
 * percentage (e.g. 14.000 for Egyptian VAT), stored as NUMERIC — not the
 * Money Value Object (CLAUDE.md §2.5), which models currency amounts, not
 * percentages. Money VO applies once a module computes an actual tax
 * amount (Sales/Purchases/Accounting), not here.
 */
const migration: TenantMigration = {
  name: '0005_create_tax_rules',
  async up(db) {
    await sql`
      CREATE TABLE tax_rules (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        rate NUMERIC(6,3) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT tax_rules_rate_range CHECK (rate >= 0 AND rate <= 100)
      )
    `.execute(db);
  },
};

export default migration;
