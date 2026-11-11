import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 2 (project-docs/hr-module-plan-2026-11-11.md): salary components and each
 * employee's salary history.
 *
 *  - hr_salary_components: recurring earnings (بدلات) and deductions (استقطاعات), a fixed amount or a
 *    % of the basic salary, with a suggested default.
 *  - hr_employee_salaries: one row per salary revision, in force from effective_from until the next
 *    revision (no end column: the next row is the end, so history can never overlap or leave gaps).
 *    Amounts are minor units of the company currency.
 *  - hr_employee_salary_lines: the components on a revision, as entered (amount or percent).
 *  - Permissions hr.salaries.view (salaries are hidden without it) and hr.salaries.manage.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.salaries.view', 'See employee salaries and the salaries register'],
  ['hr.salaries.manage', 'Set employee salaries and salary components'],
];

const migration: TenantMigration = {
  name: '0124_hr_salaries',
  async up(db) {
    await sql`
      CREATE TABLE hr_salary_components (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction')),
        calculation TEXT NOT NULL CHECK (calculation IN ('fixed', 'percent_of_basic')),
        default_amount_minor BIGINT CHECK (default_amount_minor IS NULL OR default_amount_minor >= 0),
        default_percent NUMERIC(7,3) CHECK (default_percent IS NULL OR (default_percent >= 0 AND default_percent <= 1000)),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_salary_components_default_matches CHECK (
          (calculation = 'fixed' AND default_percent IS NULL)
          OR (calculation = 'percent_of_basic' AND default_amount_minor IS NULL)
        )
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_employee_salaries (
        id UUID PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        effective_from DATE NOT NULL,
        basic_minor BIGINT NOT NULL CHECK (basic_minor >= 0),
        notes TEXT,
        created_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_employee_salaries_one_per_date UNIQUE (employee_id, effective_from)
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_employee_salary_lines (
        id UUID PRIMARY KEY,
        salary_id UUID NOT NULL REFERENCES hr_employee_salaries (id) ON DELETE CASCADE,
        component_id UUID NOT NULL REFERENCES hr_salary_components (id) ON DELETE RESTRICT,
        amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor >= 0),
        percent NUMERIC(7,3) CHECK (percent IS NULL OR (percent >= 0 AND percent <= 1000)),
        CONSTRAINT hr_employee_salary_lines_one_value CHECK ((amount_minor IS NULL) <> (percent IS NULL)),
        CONSTRAINT hr_employee_salary_lines_unique UNIQUE (salary_id, component_id)
      )
    `.execute(db);
    await sql`CREATE INDEX hr_employee_salary_lines_component_idx ON hr_employee_salary_lines (component_id)`.execute(db);

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
      WHERE p.key LIKE 'hr.salaries.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
