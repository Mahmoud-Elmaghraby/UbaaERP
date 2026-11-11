import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 1 (docs/claude-context/project-docs/hr-module-plan-2026-11-11.md):
 * the organisation structure and the employee file.
 *
 *  - hr_departments: a tree (parent_id) with an optional head (manager_id → employees).
 *  - hr_job_titles: المسميات الوظيفية.
 *  - employees: the employee file. branch / department / job title / manager / system user are
 *    all optional links. A terminated employee always carries the end-of-service date.
 *  - Attachments accept 'employee' (ID copy, contract, certificates…).
 *  - Permissions hr.employees.view / hr.employees.manage, granted to the Owner role.
 *  - The 'hr' module starts switched OFF for every tenant (Settings › Modules turns it on), so an
 *    existing customer's menu doesn't change on upgrade.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.employees.view', 'View employees and the organisation structure'],
  ['hr.employees.manage', 'Add and edit employees, departments and job titles'],
];

const migration: TenantMigration = {
  name: '0123_hr_core',
  async up(db) {
    await sql`
      CREATE TABLE hr_departments (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        parent_id UUID REFERENCES hr_departments (id) ON DELETE RESTRICT,
        manager_id UUID,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_departments_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_job_titles (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE employees (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        national_id TEXT UNIQUE,
        national_id_expiry DATE,
        gender TEXT CHECK (gender IN ('male', 'female')),
        birth_date DATE,
        phone TEXT,
        email TEXT,
        address TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        branch_id UUID REFERENCES branches (id) ON DELETE RESTRICT,
        department_id UUID REFERENCES hr_departments (id) ON DELETE RESTRICT,
        job_title_id UUID REFERENCES hr_job_titles (id) ON DELETE RESTRICT,
        manager_id UUID REFERENCES employees (id) ON DELETE SET NULL,
        user_id UUID UNIQUE REFERENCES users (id) ON DELETE SET NULL,
        hire_date DATE NOT NULL,
        employment_type TEXT NOT NULL DEFAULT 'full_time'
          CHECK (employment_type IN ('full_time', 'part_time', 'temporary', 'trainee')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
        termination_date DATE,
        termination_reason TEXT,
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'wallet')),
        bank_name TEXT,
        bank_account TEXT,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT employees_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id),
        CONSTRAINT employees_termination_date CHECK ((status = 'terminated') = (termination_date IS NOT NULL)),
        CONSTRAINT employees_termination_after_hire CHECK (termination_date IS NULL OR termination_date >= hire_date)
      )
    `.execute(db);
    await sql`
      ALTER TABLE hr_departments ADD CONSTRAINT hr_departments_manager_fk
        FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL
    `.execute(db);
    await sql`CREATE INDEX employees_department_idx ON employees (department_id) WHERE department_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX employees_branch_idx ON employees (branch_id) WHERE branch_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX employees_manager_idx ON employees (manager_id) WHERE manager_id IS NOT NULL`.execute(db);

    // ── attachments on the employee file ──────────────────────────────────
    await sql`ALTER TABLE attachments DROP CONSTRAINT attachments_entity_type_whitelist`.execute(db);
    await sql`
      ALTER TABLE attachments ADD CONSTRAINT attachments_entity_type_whitelist CHECK (
        entity_type IN (
          'sales_invoice', 'purchase_invoice', 'sales_order', 'purchase_order',
          'product', 'supplier', 'customer', 'journal_entry', 'employee'
        )
      )
    `.execute(db);

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
      WHERE p.key LIKE 'hr.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    // ── the module starts off (turned on in Settings › Modules) ──────────
    await sql`
      INSERT INTO tenant_feature_toggles (feature_key, enabled, updated_at)
      VALUES ('hr', false, now())
      ON CONFLICT (feature_key) DO NOTHING
    `.execute(db);
  },
};

export default migration;
