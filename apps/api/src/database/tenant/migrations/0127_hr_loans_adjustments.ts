import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 5 (project-docs/hr-module-plan-2026-11-11.md): employee loans/advances and
 * one-off bonuses/penalties.
 *
 *  - hr_loans (LN-): pending → approved → active once paid out of a treasury → closed when repaid.
 *    A loan is an asset (the company's money with the employee): paid out Dr 117 عهد وسلف موظفين /
 *    Cr treasury; repaid in cash Dr treasury / Cr 117; repaid by payroll inside the payroll entry
 *    (step 6). Accounting books it from the outbox events hr.loan.disbursed / hr.loan.repaid.
 *  - hr_loan_installments: the monthly schedule, fixed at creation; postponing moves the open
 *    ones by a month. paid_minor grows with cash repayments now and payroll deductions later.
 *  - hr_loan_repayments (LR-): cash paid back into a treasury.
 *  - hr_pay_adjustments: a bonus or penalty for one pay month, as an amount or as days of pay.
 *  - accounting_settings: employee advances (117), salaries expense (521) and salaries payable
 *    (214) mappings — the last two are used by the payroll run.
 *  - Permissions hr.loans.view / hr.loans.manage / hr.loans.approve. Bonuses and penalties use
 *    hr.salaries.view / hr.salaries.manage.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.loans.view', 'See employee loans and advances'],
  ['hr.loans.manage', 'Record loans, pay them out, take repayments and postpone installments'],
  ['hr.loans.approve', 'Approve or reject employee loans'],
];

const MAPPINGS: [string, string][] = [
  ['employee_advances_account_id', '117'],
  ['salaries_expense_account_id', '521'],
  ['salaries_payable_account_id', '214'],
];

const migration: TenantMigration = {
  name: '0127_hr_loans_adjustments',
  async up(db) {
    await sql`
      CREATE TABLE hr_loans (
        id UUID PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL,
        first_month DATE NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'active', 'closed', 'rejected', 'cancelled')),
        decided_by UUID REFERENCES users (id) ON DELETE SET NULL,
        decided_at TIMESTAMPTZ,
        decision_note TEXT,
        treasury_id UUID REFERENCES treasuries (id) ON DELETE RESTRICT,
        disbursed_on DATE,
        disbursed_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_loans_paid_out CHECK ((status IN ('active', 'closed')) = (disbursed_on IS NOT NULL AND treasury_id IS NOT NULL))
      )
    `.execute(db);
    await sql`CREATE INDEX hr_loans_employee_idx ON hr_loans (employee_id)`.execute(db);
    await sql`
      CREATE TABLE hr_loan_installments (
        id UUID PRIMARY KEY,
        loan_id UUID NOT NULL REFERENCES hr_loans (id) ON DELETE CASCADE,
        sequence INT NOT NULL,
        due_month DATE NOT NULL,
        amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
        paid_minor BIGINT NOT NULL DEFAULT 0,
        CONSTRAINT hr_loan_installments_paid CHECK (paid_minor BETWEEN 0 AND amount_minor),
        CONSTRAINT hr_loan_installments_unique UNIQUE (loan_id, sequence)
      )
    `.execute(db);
    await sql`CREATE INDEX hr_loan_installments_month_idx ON hr_loan_installments (due_month)`.execute(db);
    await sql`
      CREATE TABLE hr_loan_repayments (
        id UUID PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        loan_id UUID NOT NULL REFERENCES hr_loans (id) ON DELETE RESTRICT,
        treasury_id UUID NOT NULL REFERENCES treasuries (id) ON DELETE RESTRICT,
        repaid_on DATE NOT NULL,
        amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_pay_adjustments (
        id UUID PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('bonus', 'penalty')),
        pay_month DATE NOT NULL,
        amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),
        days NUMERIC(5,2) CHECK (days IS NULL OR days > 0),
        reason TEXT NOT NULL,
        payroll_run_id UUID,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_pay_adjustments_one_value CHECK ((amount_minor IS NULL) <> (days IS NULL))
      )
    `.execute(db);
    await sql`CREATE INDEX hr_pay_adjustments_month_idx ON hr_pay_adjustments (pay_month, employee_id)`.execute(db);

    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN employee_advances_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN salaries_expense_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN salaries_payable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    for (const [column, code] of MAPPINGS) {
      await sql`
        UPDATE accounting_settings
           SET ${sql.ref(column)} = (SELECT id FROM chart_of_accounts WHERE code = ${code} AND is_group = FALSE)
      `.execute(db);
    }

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
      WHERE p.key LIKE 'hr.loans.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
