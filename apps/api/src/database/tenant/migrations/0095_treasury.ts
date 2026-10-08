import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * Treasury module (الخزائن) — where money physically sits: cash boxes, bank
 * accounts, e-wallets. Works on its own; when Accounting is enabled each
 * treasury may be linked to a chart account (otherwise the cash / default
 * bank mapping is used) and Accounting posts every movement from events.
 *
 *  - bank_accounts (Accounting, migration 0058) becomes `treasuries`: the
 *    same rows keep their ids (so every existing payment still points at
 *    them) and gain a `kind`, a `code`, and an OPTIONAL chart account.
 *  - one main cash box per tenant ("الخزينة الرئيسية", the default for cash),
 *    linked to the cash account when Accounting has one.
 *  - payments_received / supplier_payments.bank_account_id → treasury_id;
 *    existing cash receipts/payments in the tenant currency move to the
 *    main cash box. POS sessions record which cash box they collect into.
 *  - treasury_categories: expense / income items (رواتب، إيجار، كهرباء…),
 *    seeded and linked to the matching default chart accounts if present.
 *  - treasury_vouchers: expense voucher, other-income receipt, transfer
 *    between treasuries.
 */
const EXPENSE_CATEGORIES: [string, string][] = [
  ['رواتب وأجور', '521'],
  ['إيجارات', '522'],
  ['كهرباء ومياه ومرافق', '523'],
  ['تسويق وإعلان', '524'],
  ['مستلزمات مكتبية', '525'],
  ['أتعاب مهنية', '527'],
  ['مصروفات بنكية', '528'],
  ['مصروفات متنوعة', '529'],
];
const INCOME_CATEGORIES: [string, string][] = [['إيرادات أخرى', '44']];

const PERMISSIONS: [string, string][] = [
  ['treasury.view', 'View treasuries, balances and movements'],
  ['treasury.manage', 'Create and edit treasuries and expense/income items'],
  ['treasury.vouchers.manage', 'Record and cancel expense, income and transfer vouchers'],
];

const migration: TenantMigration = {
  name: '0095_treasury',
  async up(db) {
    // ── bank_accounts → treasuries ───────────────────────────────────────
    await sql`ALTER TABLE bank_accounts RENAME TO treasuries`.execute(db);
    await sql`ALTER TABLE treasuries RENAME CONSTRAINT bank_accounts_pkey TO treasuries_pkey`.execute(db);
    await sql`ALTER TABLE treasuries RENAME CONSTRAINT bank_accounts_chart_of_account_unique TO treasuries_chart_of_account_unique`.execute(db);
    await sql`ALTER TABLE treasuries RENAME CONSTRAINT bank_accounts_chart_of_account_id_fkey TO treasuries_chart_of_account_id_fkey`.execute(db);
    await sql`
      ALTER TABLE treasuries
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('cash', 'bank', 'wallet')),
        ADD COLUMN code TEXT,
        ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE,
        ALTER COLUMN chart_of_account_id DROP NOT NULL,
        ALTER COLUMN bank_name DROP NOT NULL,
        ALTER COLUMN account_number DROP NOT NULL
    `.execute(db);
    await sql`
      UPDATE treasuries t SET code = 'BNK-' || lpad(n.rn::text, 2, '0')
      FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM treasuries) n
      WHERE n.id = t.id
    `.execute(db);

    await sql`
      INSERT INTO treasuries (id, code, name, kind, currency, chart_of_account_id, is_default)
      SELECT gen_random_uuid(), 'CASH-01', 'الخزينة الرئيسية', 'cash',
             COALESCE((SELECT currency_code FROM tenant_settings LIMIT 1), 'EGP'),
             (SELECT s.cash_account_id FROM accounting_settings s
               WHERE s.cash_account_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM treasuries x WHERE x.chart_of_account_id = s.cash_account_id)
               LIMIT 1),
             TRUE
    `.execute(db);
    await sql`ALTER TABLE treasuries ALTER COLUMN code SET NOT NULL`.execute(db);
    await sql`ALTER TABLE treasuries ADD CONSTRAINT treasuries_code_unique UNIQUE (code)`.execute(db);
    // At most one default treasury per kind and currency (the one a cash receipt goes to by default).
    await sql`CREATE UNIQUE INDEX treasuries_one_default ON treasuries (kind, currency) WHERE is_default`.execute(db);

    // ── documents point at a treasury ────────────────────────────────────
    for (const table of ['payments_received', 'supplier_payments']) {
      await sql`ALTER TABLE ${sql.table(table)} RENAME COLUMN bank_account_id TO treasury_id`.execute(db);
      await sql`
        UPDATE ${sql.table(table)} p
           SET treasury_id = (SELECT id FROM treasuries WHERE kind = 'cash' AND is_default AND currency = p.amount_currency)
         WHERE p.treasury_id IS NULL AND p.payment_method = 'cash'
      `.execute(db);
    }
    await sql`ALTER TABLE pos_sessions ADD COLUMN treasury_id UUID REFERENCES treasuries (id) ON DELETE RESTRICT`.execute(db);
    await sql`
      UPDATE pos_sessions s
         SET treasury_id = (SELECT id FROM treasuries WHERE kind = 'cash' AND is_default AND currency = s.currency)
    `.execute(db);

    // ── categories ───────────────────────────────────────────────────────
    await sql`
      CREATE TABLE treasury_categories (
        id UUID PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        name TEXT NOT NULL,
        chart_of_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT treasury_categories_kind_name_unique UNIQUE (kind, name)
      )
    `.execute(db);
    for (const [kind, list] of [['expense', EXPENSE_CATEGORIES], ['income', INCOME_CATEGORIES]] as const) {
      for (const [name, code] of list) {
        await sql`
          INSERT INTO treasury_categories (id, kind, name, chart_of_account_id)
          VALUES (gen_random_uuid(), ${kind}, ${name},
                  (SELECT id FROM chart_of_accounts WHERE code = ${code} AND is_group = FALSE))
        `.execute(db);
      }
    }

    // ── vouchers ─────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE treasury_vouchers (
        id UUID PRIMARY KEY,
        voucher_number TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
        voucher_date DATE NOT NULL,
        treasury_id UUID NOT NULL REFERENCES treasuries (id) ON DELETE RESTRICT,
        to_treasury_id UUID REFERENCES treasuries (id) ON DELETE RESTRICT,
        category_id UUID REFERENCES treasury_categories (id) ON DELETE RESTRICT,
        amount BIGINT NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        counterparty TEXT,
        description TEXT,
        reference TEXT,
        created_by_user_id UUID,
        cancelled_at TIMESTAMPTZ,
        cancel_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT treasury_vouchers_shape CHECK (
          (kind = 'transfer' AND to_treasury_id IS NOT NULL AND to_treasury_id <> treasury_id AND category_id IS NULL)
          OR (kind <> 'transfer' AND to_treasury_id IS NULL AND category_id IS NOT NULL)
        )
      )
    `.execute(db);
    await sql`CREATE INDEX treasury_vouchers_treasury_idx ON treasury_vouchers (treasury_id, voucher_date)`.execute(db);
    await sql`CREATE INDEX treasury_vouchers_to_treasury_idx ON treasury_vouchers (to_treasury_id, voucher_date)`.execute(db);

    // ── permissions ──────────────────────────────────────────────────────
    for (const [key, description] of PERMISSIONS) {
      await sql`
        INSERT INTO permissions (id, key, description)
        VALUES (gen_random_uuid(), ${key}, ${description})
        ON CONFLICT (key) DO NOTHING
      `.execute(db);
    }
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, p.id FROM permissions p
      WHERE p.key LIKE 'treasury.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
    // Whoever handled money in Sales, Purchases or Accounting keeps seeing where it went.
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key IN ('sales.manage', 'purchases.manage', 'accounting.manage')
      CROSS JOIN permissions p
      WHERE p.key = 'treasury.view'
      ON CONFLICT DO NOTHING
    `.execute(db);
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'accounting.manage'
      CROSS JOIN permissions p
      WHERE p.key IN ('treasury.manage', 'treasury.vouchers.manage')
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
