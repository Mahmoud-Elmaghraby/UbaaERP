import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 4 (project-docs/hr-module-plan-2026-11-11.md): leave types, yearly balances and
 * leave requests.
 *
 *  - hr_leave_types: pay % kept, whether a yearly balance applies, the default entitlement, the
 *    carry-over cap, and an optional parent whose balance it also uses. Seeded from the Egyptian
 *    Labour Law defaults (editable): annual 21 days; casual 6 days, out of the annual balance;
 *    sick (paid, no balance); unpaid.
 *  - hr_leave_balances: only when an employee's year differs from the type default (entitlement,
 *    carried-over days, an opening/correction adjustment). Used days are always computed from the
 *    requests, never stored.
 *  - hr_leave_requests: numbered (LV-), one calendar year each, days counted on the employee's
 *    working days. pending → approved / rejected; pending or approved → cancelled.
 *  - hr_attendance_days.leave_request_id: an approved leave marks its working days on the sheet.
 *  - Permissions hr.leaves.view / hr.leaves.manage / hr.leaves.approve.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.leaves.view', 'See leave requests and balances'],
  ['hr.leaves.manage', 'Record leave requests, leave types and balances'],
  ['hr.leaves.approve', 'Approve or reject leave requests'],
];

const migration: TenantMigration = {
  name: '0126_hr_leaves',
  async up(db) {
    await sql`
      CREATE TABLE hr_leave_types (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        pay_percent INT NOT NULL DEFAULT 100 CHECK (pay_percent BETWEEN 0 AND 100),
        has_balance BOOLEAN NOT NULL DEFAULT true,
        annual_days NUMERIC(5,1) CHECK (annual_days IS NULL OR annual_days >= 0),
        max_carry_over NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (max_carry_over >= 0),
        parent_type_id UUID REFERENCES hr_leave_types (id) ON DELETE RESTRICT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_leave_types_not_own_parent CHECK (parent_type_id IS NULL OR parent_type_id <> id)
      )
    `.execute(db);
    await sql`
      WITH annual AS (
        INSERT INTO hr_leave_types (id, name, pay_percent, has_balance, annual_days)
        VALUES (gen_random_uuid(), 'اعتيادي', 100, true, 21)
        RETURNING id
      )
      INSERT INTO hr_leave_types (id, name, pay_percent, has_balance, annual_days, parent_type_id)
      SELECT gen_random_uuid(), 'عارضة', 100, true, 6, annual.id FROM annual
    `.execute(db);
    await sql`
      INSERT INTO hr_leave_types (id, name, pay_percent, has_balance, annual_days) VALUES
        (gen_random_uuid(), 'مرضي', 100, false, NULL),
        (gen_random_uuid(), 'بدون أجر', 0, false, NULL)
    `.execute(db);

    await sql`
      CREATE TABLE hr_leave_balances (
        id UUID PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
        leave_type_id UUID NOT NULL REFERENCES hr_leave_types (id) ON DELETE CASCADE,
        year INT NOT NULL,
        entitled NUMERIC(5,1) NOT NULL CHECK (entitled >= 0),
        carried_over NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (carried_over >= 0),
        adjustment NUMERIC(5,1) NOT NULL DEFAULT 0,
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_leave_balances_unique UNIQUE (employee_id, leave_type_id, year)
      )
    `.execute(db);

    await sql`
      CREATE TABLE hr_leave_requests (
        id UUID PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        leave_type_id UUID NOT NULL REFERENCES hr_leave_types (id) ON DELETE RESTRICT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        half_day BOOLEAN NOT NULL DEFAULT false,
        days NUMERIC(5,1) NOT NULL CHECK (days >= 0),
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        decided_by UUID REFERENCES users (id) ON DELETE SET NULL,
        decided_at TIMESTAMPTZ,
        decision_note TEXT,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_leave_requests_dates CHECK (end_date >= start_date),
        CONSTRAINT hr_leave_requests_one_year CHECK (date_part('year', start_date) = date_part('year', end_date)),
        CONSTRAINT hr_leave_requests_half_day CHECK (NOT half_day OR start_date = end_date)
      )
    `.execute(db);
    await sql`CREATE INDEX hr_leave_requests_employee_idx ON hr_leave_requests (employee_id, start_date)`.execute(db);

    await sql`
      ALTER TABLE hr_attendance_days
        ADD COLUMN leave_request_id UUID REFERENCES hr_leave_requests (id) ON DELETE SET NULL
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
      WHERE p.key LIKE 'hr.leaves.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
