import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 6 (project-docs/hr-module-plan-2026-11-11.md): the monthly payroll run.
 *
 *  - hr_payroll_runs (PR-): one month, optionally one branch or department. draft (calculated,
 *    editable, recalculable) → posted (approved: in the books through the outbox event
 *    hr.payroll.posted — Dr salaries expense / Cr employee advances for loan installments /
 *    Cr salaries payable; bonuses and penalties settled, loan installments paid) → paid.
 *  - hr_payroll_lines: one per employee and month (pay_month is repeated on the line so an
 *    employee can't be in two runs of the same month). Amounts in minor units; `overridden` lists
 *    the suggested amounts HR replaced (kept through a recalculation); `details` holds the working.
 *  - hr_payroll_payments (PP-): net pay paid from a treasury (hr.payroll.paid — Dr salaries
 *    payable / Cr treasury).
 *  - hr_pay_adjustments.payroll_run_id now points at the run that settled it.
 *  - Permissions hr.payroll.view / manage / approve / pay.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.payroll.view', 'See payroll runs and payslips'],
  ['hr.payroll.manage', 'Prepare payroll runs and adjust their lines'],
  ['hr.payroll.approve', 'Approve and post payroll runs'],
  ['hr.payroll.pay', 'Pay salaries from a treasury'],
];

const AMOUNT_COLUMNS = [
  'basic_minor',
  'allowances_minor',
  'overtime_minor',
  'bonuses_minor',
  'gross_minor',
  'component_deductions_minor',
  'absence_minor',
  'late_minor',
  'unpaid_leave_minor',
  'penalties_minor',
  'loan_minor',
  'net_minor',
  'expense_minor',
];

const migration: TenantMigration = {
  name: '0128_hr_payroll',
  async up(db) {
    await sql`
      CREATE TABLE hr_payroll_runs (
        id UUID PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        pay_month DATE NOT NULL,
        branch_id UUID REFERENCES branches (id) ON DELETE RESTRICT,
        department_id UUID REFERENCES hr_departments (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'paid')),
        currency TEXT NOT NULL,
        notes TEXT,
        skipped_employees TEXT[] NOT NULL DEFAULT '{}',
        posted_by UUID REFERENCES users (id) ON DELETE SET NULL,
        posted_at TIMESTAMPTZ,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_payroll_payments (
        id UUID PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        run_id UUID NOT NULL REFERENCES hr_payroll_runs (id) ON DELETE RESTRICT,
        treasury_id UUID NOT NULL REFERENCES treasuries (id) ON DELETE RESTRICT,
        paid_on DATE NOT NULL,
        amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
        currency TEXT NOT NULL,
        line_count INT NOT NULL,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_payroll_lines (
        id UUID PRIMARY KEY,
        run_id UUID NOT NULL REFERENCES hr_payroll_runs (id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        pay_month DATE NOT NULL,
        ${sql.raw(AMOUNT_COLUMNS.map((c) => `${c} BIGINT NOT NULL DEFAULT 0 CHECK (${c} >= 0)`).join(',\n        '))},
        manual_adjustment_minor BIGINT NOT NULL DEFAULT 0,
        manual_adjustment_note TEXT,
        overridden TEXT[] NOT NULL DEFAULT '{}',
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        warnings TEXT[] NOT NULL DEFAULT '{}',
        payment_id UUID REFERENCES hr_payroll_payments (id) ON DELETE SET NULL,
        CONSTRAINT hr_payroll_lines_one_per_month UNIQUE (employee_id, pay_month)
      )
    `.execute(db);
    await sql`CREATE INDEX hr_payroll_lines_run_idx ON hr_payroll_lines (run_id)`.execute(db);
    await sql`
      ALTER TABLE hr_pay_adjustments
        ADD CONSTRAINT hr_pay_adjustments_run_fk FOREIGN KEY (payroll_run_id) REFERENCES hr_payroll_runs (id) ON DELETE SET NULL
    `.execute(db);

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
      WHERE p.key LIKE 'hr.payroll.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
