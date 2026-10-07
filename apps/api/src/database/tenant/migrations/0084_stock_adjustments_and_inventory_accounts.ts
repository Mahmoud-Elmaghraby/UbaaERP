import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Stock adjustments as a numbered document + the accounts every inventory
 * value change posts to (inventory completion, step 4 — GL postings).
 *
 * 1. stock_adjustment_reasons — why stock went up or down (damaged, internal
 *    use, free samples, theft, count difference…). A reason may carry its
 *    own GL account (e.g. "internal use" → an expense account); otherwise
 *    Accounting's default inventory-adjustment account is used. Daftra and
 *    Odoo both drive the counter-account of a manual stock change this way.
 *
 * 2. stock_adjustments / stock_adjustment_lines (ADJ-00001) — a multi-line
 *    increase/decrease document, draft → posted | cancelled. Every manual
 *    stock change (including the quick "record movement" dialog) is now an
 *    adjustment, so each one has a number, a reason, an audit trail and a
 *    journal entry.
 *
 * 3. Default chart-of-accounts leaves (added only when the code is free —
 *    the tree is the tenant's to edit) and four new accounting_settings
 *    mappings, auto-filled from them:
 *      217 بضاعة مستلمة لم تصل فواتيرها (GRNI)  — goods receipts credit it, purchase invoices clear it
 *      35  أرصدة افتتاحية                       — opening stock balances
 *      54  تسويات وفروق المخزون                  — default adjustment / count difference account
 *      landed-cost clearing → NULL = falls back to the purchase-expense account
 *        (the account the freight/customs bill was debited to), Odoo-style.
 */
const REASONS: [string, string, number][] = [
  ['فروق جرد', 'both', 10],
  ['تالف / هالك', 'decrease', 20],
  ['منتهي الصلاحية', 'decrease', 30],
  ['استهلاك داخلي', 'decrease', 40],
  ['عينات وهدايا', 'decrease', 50],
  ['فقد / سرقة', 'decrease', 60],
  ['إضافة بدون فاتورة', 'increase', 70],
  ['تسوية رصيد', 'both', 80],
];

const migration: TenantMigration = {
  name: '0084_stock_adjustments_and_inventory_accounts',
  async up(db) {
    await sql`
      CREATE TABLE stock_adjustment_reasons (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('increase', 'decrease', 'both')),
        account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX stock_adjustment_reasons_name_uidx ON stock_adjustment_reasons (lower(name))`.execute(db);
    for (const [name, direction, sortOrder] of REASONS) {
      await sql`
        INSERT INTO stock_adjustment_reasons (id, name, direction, sort_order)
        VALUES (gen_random_uuid(), ${name}, ${direction}, ${sortOrder})
      `.execute(db);
    }

    await sql`
      CREATE TABLE stock_adjustments (
        id UUID PRIMARY KEY,
        adjustment_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        location_id UUID NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
        reason_id UUID REFERENCES stock_adjustment_reasons(id) ON DELETE RESTRICT,
        adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_by UUID,
        posted_by UUID,
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX stock_adjustments_warehouse_idx ON stock_adjustments (warehouse_id)`.execute(db);

    await sql`
      CREATE TABLE stock_adjustment_lines (
        id UUID PRIMARY KEY,
        stock_adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease')),
        quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
        unit_of_measure_id UUID REFERENCES units_of_measure(id) ON DELETE RESTRICT,
        unit_factor NUMERIC(18, 6) NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
        unit_cost_amount BIGINT CHECK (unit_cost_amount >= 0),
        unit_cost_currency TEXT,
        lot_number TEXT,
        expiry_date DATE,
        reason_id UUID REFERENCES stock_adjustment_reasons(id) ON DELETE RESTRICT,
        posted_value_amount BIGINT,
        posted_value_currency TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_adjustment_lines_cost_pair CHECK ((unit_cost_amount IS NULL) = (unit_cost_currency IS NULL))
      )
    `.execute(db);
    await sql`CREATE INDEX stock_adjustment_lines_adjustment_idx ON stock_adjustment_lines (stock_adjustment_id)`.execute(
      db,
    );

    // Default accounts — only where the tenant hasn't used the code already.
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
      SELECT gen_random_uuid(), '217', 'بضاعة مستلمة لم تصل فواتيرها', 'liability', 'credit',
             (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE
      WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '217')
        AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '21')
    `.execute(db);
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
      SELECT gen_random_uuid(), '35', 'أرصدة افتتاحية', 'equity', 'credit',
             (SELECT id FROM chart_of_accounts WHERE code = '3'), FALSE
      WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '35')
        AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '3')
    `.execute(db);
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
      SELECT gen_random_uuid(), '54', 'تسويات وفروق المخزون', 'expense', 'debit',
             (SELECT id FROM chart_of_accounts WHERE code = '5'), FALSE
      WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '54')
        AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '5')
    `.execute(db);

    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN grni_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN inventory_adjustment_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN opening_balance_equity_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN landed_cost_clearing_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      UPDATE accounting_settings SET
        grni_account_id = (SELECT id FROM chart_of_accounts WHERE code = '217' AND is_group = FALSE),
        inventory_adjustment_account_id = (SELECT id FROM chart_of_accounts WHERE code = '54' AND is_group = FALSE),
        opening_balance_equity_account_id = (SELECT id FROM chart_of_accounts WHERE code = '35' AND is_group = FALSE)
    `.execute(db);
  },
};

export default migration;
