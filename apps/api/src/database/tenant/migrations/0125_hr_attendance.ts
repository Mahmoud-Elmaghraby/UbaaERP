import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';
import { OWNER_ROLE_ID } from '../well-known-ids';

/**
 * HR module, step 3 (project-docs/hr-module-plan-2026-11-11.md): shifts, public holidays and
 * attendance from fingerprint-device exports.
 *
 * Times are plain minutes, never time zones: a shift's start/end are minutes after midnight, and a
 * day's check-in/out are minutes after that work day's midnight (≥ 1440 = the next morning, for a
 * night shift). Raw punches keep the device's wall-clock time (TIMESTAMP without zone).
 *
 *  - hr_shifts: start/end, grace, unpaid break, weekly days off. One default shift (seeded:
 *    09:00–17:00, 15 min grace, Friday off) covers employees without a shift of their own.
 *  - employees.shift_id, employees.attendance_code (the number on the device, when not the code).
 *  - hr_public_holidays: one row per day off.
 *  - hr_attendance_imports / hr_attendance_punches: each import, and its punches (one per employee
 *    per minute — importing the same file twice adds nothing).
 *  - hr_attendance_days: the daily sheet, rebuilt from punches; a day edited by hand (is_manual) is
 *    never overwritten by a rebuild.
 *  - Permissions hr.attendance.view / hr.attendance.manage.
 */
const PERMISSIONS: [string, string][] = [
  ['hr.attendance.view', 'See attendance sheets, shifts and holidays'],
  ['hr.attendance.manage', 'Import attendance, correct days, and set shifts and holidays'],
];

const migration: TenantMigration = {
  name: '0125_hr_attendance',
  async up(db) {
    await sql`
      CREATE TABLE hr_shifts (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        start_minute INT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
        end_minute INT NOT NULL CHECK (end_minute BETWEEN 0 AND 1439),
        grace_minutes INT NOT NULL DEFAULT 15 CHECK (grace_minutes BETWEEN 0 AND 240),
        break_minutes INT NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
        weekly_off_days INT[] NOT NULL DEFAULT '{5}',
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX hr_shifts_one_default ON hr_shifts (is_default) WHERE is_default`.execute(db);
    await sql`
      INSERT INTO hr_shifts (id, name, start_minute, end_minute, grace_minutes, break_minutes, weekly_off_days, is_default)
      VALUES (gen_random_uuid(), 'الوردية الأساسية', 540, 1020, 15, 0, '{5}', true)
    `.execute(db);

    await sql`ALTER TABLE employees ADD COLUMN shift_id UUID REFERENCES hr_shifts (id) ON DELETE RESTRICT`.execute(db);
    await sql`ALTER TABLE employees ADD COLUMN attendance_code TEXT`.execute(db);
    await sql`CREATE UNIQUE INDEX employees_attendance_code_key ON employees (attendance_code) WHERE attendance_code IS NOT NULL`.execute(db);

    await sql`
      CREATE TABLE hr_public_holidays (
        id UUID PRIMARY KEY,
        holiday_date DATE NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE TABLE hr_attendance_imports (
        id UUID PRIMARY KEY,
        file_name TEXT NOT NULL,
        rows_total INT NOT NULL,
        rows_imported INT NOT NULL,
        imported_by UUID REFERENCES users (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE hr_attendance_punches (
        id UUID PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
        punched_at TIMESTAMP NOT NULL,
        import_id UUID REFERENCES hr_attendance_imports (id) ON DELETE SET NULL,
        CONSTRAINT hr_attendance_punches_unique UNIQUE (employee_id, punched_at)
      )
    `.execute(db);

    await sql`
      CREATE TABLE hr_attendance_days (
        id UUID PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'weekend', 'holiday', 'leave')),
        check_in_minute INT,
        check_out_minute INT,
        missing_punch BOOLEAN NOT NULL DEFAULT false,
        worked_minutes INT NOT NULL DEFAULT 0,
        late_minutes INT NOT NULL DEFAULT 0,
        early_leave_minutes INT NOT NULL DEFAULT 0,
        overtime_minutes INT NOT NULL DEFAULT 0,
        is_manual BOOLEAN NOT NULL DEFAULT false,
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT hr_attendance_days_unique UNIQUE (employee_id, work_date)
      )
    `.execute(db);
    await sql`CREATE INDEX hr_attendance_days_date_idx ON hr_attendance_days (work_date)`.execute(db);

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
      WHERE p.key LIKE 'hr.attendance.%' AND EXISTS (SELECT 1 FROM roles WHERE id = ${OWNER_ROLE_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);
  },
};

export default migration;
