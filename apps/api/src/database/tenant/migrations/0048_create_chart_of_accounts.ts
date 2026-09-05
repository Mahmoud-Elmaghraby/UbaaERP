import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * chart_of_accounts (master doc §10/§16.6, CLAUDE.md §10 — step 5,
 * Accounting; the last module in the fixed build order, now that
 * Inventory/Purchases/Sales are done). Foundational entity: every later
 * Accounting entity (journal_entries, cost_centers via tagging, bank
 * reconciliation) references accounts from this tree.
 *
 * Tree shape, cross-checked against a competitor research pass this
 * stage (see claude/accounting-module-research.md): Daftra — the
 * closest Egyptian-market precedent — models exactly five root accounts
 * (Assets/Liabilities/Equity/Revenue/Expenses) that branch into "main"
 * accounts (folders) and finally "sub" accounts (the only ones postable).
 * This migration follows that shape:
 * - is_group = true  -> a folder in the tree; cannot receive postings
 *   directly (enforced by ChartOfAccountsService.assertPostable(), which
 *   the future Journal Entries stage will call before allowing a post).
 * - is_group = false -> a leaf; the only kind of account a journal entry
 *   line can reference.
 * - is_system = true -> reserved for the five root accounts ONLY. They
 *   cannot be deactivated or deleted (ChartOfAccountsService enforces
 *   this). Every other seeded account, main or leaf, is a completely
 *   ordinary row the tenant can rename, deactivate, or delete freely —
 *   matching the master doc §13's "قالب مصري افتراضي ... قابل للتعديل
 *   الكامل بعد ذلك" (a default Egyptian template, fully editable
 *   afterward) literally: only the five roots are structurally fixed.
 *
 * normal_balance is stored explicitly per account rather than derived
 * from account_type, specifically so contra accounts (accumulated
 * depreciation under Assets, sales returns/discounts under Revenue,
 * owner's drawings under Equity, purchase discounts under Expenses) can
 * carry the opposite normal balance from their category's default.
 *
 * parent_id is a self-reference with ON DELETE RESTRICT — deliberately
 * blocks deleting a group account that still has children at the
 * database level too, as a second line of defense behind the service's
 * own "still has N child accounts" check.
 *
 * No unit_price/Money column anywhere on this table — an account's
 * balance is always derived from journal_entry_lines (Stage 2), never
 * stored here, same "don't store what's derivable" principle used
 * throughout every prior module (e.g. purchase/sales order totals).
 *
 * Permission: single coarse 'accounting.manage' permission covering the
 * whole module, matching the one-permission-per-module convention
 * established by 'purchases.manage'/'sales.manage'. Seeded + granted to
 * Owner inline, per 0029's own recommendation for every module since.
 */
const migration: TenantMigration = {
  name: '0048_create_chart_of_accounts',
  async up(db) {
    await sql`
      CREATE TABLE chart_of_accounts (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
        normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
        parent_id UUID REFERENCES chart_of_accounts (id) ON DELETE RESTRICT,
        is_group BOOLEAN NOT NULL DEFAULT FALSE,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chart_of_accounts_code_unique UNIQUE (code)
      )
    `.execute(db);

    await sql`CREATE INDEX chart_of_accounts_parent_id_idx ON chart_of_accounts (parent_id)`.execute(db);
    await sql`CREATE INDEX chart_of_accounts_account_type_idx ON chart_of_accounts (account_type)`.execute(db);
    await sql`CREATE INDEX chart_of_accounts_is_active_idx ON chart_of_accounts (is_active)`.execute(db);

    // --- Permission -------------------------------------------------------
    await sql`
      INSERT INTO permissions (id, key, description) VALUES
        (gen_random_uuid(), 'accounting.manage', 'Manage the chart of accounts, fiscal years, accounting periods, and journal entries')
    `.execute(db);

    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${OWNER_ROLE_ID}::uuid, id FROM permissions WHERE key = 'accounting.manage'
    `.execute(db);

    // --- Default Egyptian chart of accounts template -----------------------
    // Level 1: the five root accounts (is_group, is_system).
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group, is_system) VALUES
        (gen_random_uuid(), '1', 'الأصول',      'asset',     'debit',  NULL, TRUE, TRUE),
        (gen_random_uuid(), '2', 'الخصوم',      'liability', 'credit', NULL, TRUE, TRUE),
        (gen_random_uuid(), '3', 'حقوق الملكية', 'equity',    'credit', NULL, TRUE, TRUE),
        (gen_random_uuid(), '4', 'الإيرادات',    'revenue',   'credit', NULL, TRUE, TRUE),
        (gen_random_uuid(), '5', 'المصروفات',    'expense',   'debit',  NULL, TRUE, TRUE)
    `.execute(db);

    // Level 2: main groups + a few accounts that sit directly under a root
    // (equity/revenue/expense don't need an extra "main" layer for an MVP
    // template — the tenant can insert one later, it's fully editable).
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group) VALUES
        (gen_random_uuid(), '11', 'الأصول المتداولة',        'asset',     'debit',  (SELECT id FROM chart_of_accounts WHERE code = '1'), TRUE),
        (gen_random_uuid(), '12', 'الأصول الثابتة',          'asset',     'debit',  (SELECT id FROM chart_of_accounts WHERE code = '1'), TRUE),
        (gen_random_uuid(), '21', 'الخصوم المتداولة',        'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '2'), TRUE),
        (gen_random_uuid(), '22', 'الخصوم طويلة الأجل',      'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '2'), TRUE),
        (gen_random_uuid(), '31', 'رأس المال',               'equity',    'credit', (SELECT id FROM chart_of_accounts WHERE code = '3'), FALSE),
        (gen_random_uuid(), '32', 'أرباح مرحّلة',             'equity',    'credit', (SELECT id FROM chart_of_accounts WHERE code = '3'), FALSE),
        (gen_random_uuid(), '33', 'مسحوبات المالك',          'equity',    'debit',  (SELECT id FROM chart_of_accounts WHERE code = '3'), FALSE),
        (gen_random_uuid(), '34', 'أرباح العام الحالي',       'equity',    'credit', (SELECT id FROM chart_of_accounts WHERE code = '3'), FALSE),
        (gen_random_uuid(), '41', 'إيرادات المبيعات',         'revenue',   'credit', (SELECT id FROM chart_of_accounts WHERE code = '4'), FALSE),
        (gen_random_uuid(), '42', 'مردودات ومسموحات المبيعات', 'revenue',   'debit',  (SELECT id FROM chart_of_accounts WHERE code = '4'), FALSE),
        (gen_random_uuid(), '43', 'خصم مسموح به',            'revenue',   'debit',  (SELECT id FROM chart_of_accounts WHERE code = '4'), FALSE),
        (gen_random_uuid(), '44', 'إيرادات أخرى',             'revenue',   'credit', (SELECT id FROM chart_of_accounts WHERE code = '4'), FALSE),
        (gen_random_uuid(), '51', 'تكلفة البضاعة المباعة',    'expense',   'debit',  (SELECT id FROM chart_of_accounts WHERE code = '5'), FALSE),
        (gen_random_uuid(), '52', 'المصروفات التشغيلية',      'expense',   'debit',  (SELECT id FROM chart_of_accounts WHERE code = '5'), TRUE),
        (gen_random_uuid(), '53', 'خصم مكتسب',                'expense',   'credit', (SELECT id FROM chart_of_accounts WHERE code = '5'), FALSE)
    `.execute(db);

    // Level 3: leaves under the level-2 group accounts.
    await sql`
      INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group) VALUES
        (gen_random_uuid(), '111', 'النقدية بالصندوق',            'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '112', 'البنوك',                      'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '113', 'عملاء - حسابات مدينة',        'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '114', 'المخزون',                     'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '115', 'مصروفات مدفوعة مقدمًا',       'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '116', 'ضريبة القيمة المضافة - مدخلات', 'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '117', 'عهد وسلف موظفين',              'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '11'), FALSE),
        (gen_random_uuid(), '121', 'أراضٍ ومبانٍ',                 'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '12'), FALSE),
        (gen_random_uuid(), '122', 'آلات ومعدات',                 'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '12'), FALSE),
        (gen_random_uuid(), '123', 'أثاث وتجهيزات مكتبية',        'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '12'), FALSE),
        (gen_random_uuid(), '124', 'سيارات',                      'asset', 'debit',  (SELECT id FROM chart_of_accounts WHERE code = '12'), FALSE),
        (gen_random_uuid(), '125', 'مجمع إهلاك الأصول الثابتة',    'asset', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '12'), FALSE),
        (gen_random_uuid(), '211', 'موردون - حسابات دائنة',       'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '212', 'ضريبة القيمة المضافة - مخرجات', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '213', 'مصروفات مستحقة',              'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '214', 'رواتب مستحقة',                'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '215', 'دفعات مقدمة من عملاء',        'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '216', 'ضرائب مستحقة أخرى',           'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '21'), FALSE),
        (gen_random_uuid(), '221', 'قروض طويلة الأجل',            'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE code = '22'), FALSE),
        (gen_random_uuid(), '521', 'رواتب وأجور',                 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '522', 'إيجارات',                     'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '523', 'مرافق (كهرباء ومياه)',        'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '524', 'تسويق وإعلان',                'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '525', 'مستلزمات مكتبية',             'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '526', 'إهلاك',                       'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '527', 'أتعاب مهنية',                 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '528', 'مصروفات بنكية',               'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE),
        (gen_random_uuid(), '529', 'مصروفات متنوعة',              'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE code = '52'), FALSE)
    `.execute(db);
  },
};

export default migration;
