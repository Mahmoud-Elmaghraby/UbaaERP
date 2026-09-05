import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Unit-of-measure conversion (competitor research, CLAUDE.md §17 — Odoo's
 * automatic unit conversion between purchase/sale units; approved by the
 * user on 2026-08-28). Deliberately one level deep only: a unit either IS
 * a base unit (base_unit_id NULL) or is defined as `conversion_factor`
 * multiples of exactly one base unit — no multi-step conversion chains,
 * to keep the conversion math (and the validation that a graph of units
 * doesn't cycle) simple. UnitsOfMeasureService enforces the one-level
 * rule; the CHECK constraint here only stops the trivial self-reference case.
 */
const migration: TenantMigration = {
  name: '0025_add_conversion_to_units_of_measure',
  async up(db) {
    await sql`ALTER TABLE units_of_measure ADD COLUMN base_unit_id UUID REFERENCES units_of_measure (id)`.execute(db);
    await sql`ALTER TABLE units_of_measure ADD COLUMN conversion_factor NUMERIC(18, 6) NOT NULL DEFAULT 1`.execute(db);
    await sql`ALTER TABLE units_of_measure ADD CONSTRAINT units_of_measure_conversion_factor_positive CHECK (conversion_factor > 0)`.execute(db);
    await sql`ALTER TABLE units_of_measure ADD CONSTRAINT units_of_measure_no_self_reference CHECK (base_unit_id IS NULL OR base_unit_id <> id)`.execute(db);
  },
};

export default migration;
