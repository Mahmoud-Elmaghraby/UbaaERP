import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Taxes on invoices — setup part (the invoices themselves get their tax
 * snapshot columns in the next migration).
 *
 * tax_rules learns WHAT a rule is, so the engine
 * (libs/shared-kernel/src/tax/tax-calculator.ts) knows how to apply it and
 * the ETA e-invoice can report it:
 *  - kind: 'vat' (T1) | 'table' (T2, part of the VAT base) | 'withholding'
 *    (T4, deducted from what the buyer pays).
 *  - eta_type / eta_subtype: ETA codes (T1/V009, T4/W010 …).
 *  - scope: offered on 'sales', 'purchases' or 'both'.
 * Existing rules were all used as VAT, so they become kind 'vat' (T1;
 * V009 general, or V003 exempt when the rate is 0).
 *
 * A tenant with no rules gets Egypt's common set (editable): VAT 14%,
 * exempt 0%, and withholding (خصم من المنبع) 1% supplies / 3% services /
 * 5% professional fees.
 *
 * customers / suppliers: the withholding rule applied by default on their
 * invoices (a customer that withholds from us; a supplier we withhold from).
 *
 * Accounting: tax accounts and their mappings —
 *   212 VAT output (exists), 116 VAT input (exists),
 *   218 table tax output, 219 withholding payable (we withheld from
 *   suppliers, owed to the tax authority), 118 withholding receivable
 *   (customers withheld from us, deductible from our income tax).
 * Table tax on PURCHASES is not recoverable by default and goes to
 * purchase expense (remappable).
 */
const ACCOUNTS: { code: string; name: string; type: string; balance: string; parent: string }[] = [
  { code: '218', name: 'ضريبة الجدول - مخرجات', type: 'liability', balance: 'credit', parent: '21' },
  { code: '219', name: 'ضرائب خصم من المنبع مستحقة (خصم وإضافة)', type: 'liability', balance: 'credit', parent: '21' },
  { code: '118', name: 'ضرائب خصم من المنبع لدى العملاء', type: 'asset', balance: 'debit', parent: '11' },
];

const MAPPINGS: { column: string; code: string }[] = [
  { column: 'vat_output_account_id', code: '212' },
  { column: 'vat_input_account_id', code: '116' },
  { column: 'table_tax_output_account_id', code: '218' },
  { column: 'table_tax_input_account_id', code: '55' },
  { column: 'withholding_payable_account_id', code: '219' },
  { column: 'withholding_receivable_account_id', code: '118' },
];

const migration: TenantMigration = {
  name: '0091_invoice_taxes_setup',
  async up(db) {
    await sql`
      ALTER TABLE tax_rules
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'vat',
        ADD COLUMN eta_type TEXT,
        ADD COLUMN eta_subtype TEXT,
        ADD COLUMN scope TEXT NOT NULL DEFAULT 'both',
        ADD CONSTRAINT tax_rules_kind_check CHECK (kind IN ('vat', 'table', 'withholding')),
        ADD CONSTRAINT tax_rules_scope_check CHECK (scope IN ('sales', 'purchases', 'both'))
    `.execute(db);
    await sql`
      UPDATE tax_rules SET eta_type = 'T1', eta_subtype = CASE WHEN rate = 0 THEN 'V003' ELSE 'V009' END
    `.execute(db);
    await sql`
      INSERT INTO tax_rules (id, name, rate, kind, eta_type, eta_subtype, scope)
      SELECT gen_random_uuid(), v.name, v.rate, v.kind, v.eta_type, v.eta_subtype, v.scope
        FROM (VALUES
          ('ضريبة القيمة المضافة 14%', 14, 'vat', 'T1', 'V009', 'both'),
          ('معفى من ضريبة القيمة المضافة', 0, 'vat', 'T1', 'V003', 'both'),
          ('خصم من المنبع 1% - توريدات', 1, 'withholding', 'T4', 'W002', 'both'),
          ('خصم من المنبع 3% - خدمات', 3, 'withholding', 'T4', 'W004', 'both'),
          ('خصم من المنبع 5% - أتعاب مهنية', 5, 'withholding', 'T4', 'W010', 'both')
        ) AS v(name, rate, kind, eta_type, eta_subtype, scope)
       WHERE NOT EXISTS (SELECT 1 FROM tax_rules)
    `.execute(db);

    for (const table of ['customers', 'suppliers']) {
      await sql`
        ALTER TABLE ${sql.table(table)}
          ADD COLUMN withholding_tax_rule_id UUID REFERENCES tax_rules (id) ON DELETE SET NULL
      `.execute(db);
    }

    for (const account of ACCOUNTS) {
      await sql`
        INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
        SELECT gen_random_uuid(), ${account.code}, ${account.name}, ${account.type}, ${account.balance},
               (SELECT id FROM chart_of_accounts WHERE code = ${account.parent}), FALSE
        WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = ${account.code})
          AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = ${account.parent})
      `.execute(db);
    }
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN vat_output_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN vat_input_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN table_tax_output_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN table_tax_input_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN withholding_payable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN withholding_receivable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    for (const mapping of MAPPINGS) {
      await sql`
        UPDATE accounting_settings
           SET ${sql.ref(mapping.column)} = (
                 SELECT id FROM chart_of_accounts WHERE code = ${mapping.code} AND is_group = FALSE
               )
         WHERE ${sql.ref(mapping.column)} IS NULL
      `.execute(db);
    }
  },
};

export default migration;
