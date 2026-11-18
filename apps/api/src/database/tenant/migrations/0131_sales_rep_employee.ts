import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * A sales rep may be one of the company's employees (HR). Optional: a rep can still be an outside
 * agent with no employee record. Deleting the employee keeps the rep and just drops the link.
 */
const migration: TenantMigration = {
  name: '0131_sales_rep_employee',
  up: async (db) => {
    await sql`ALTER TABLE sales_reps ADD COLUMN employee_id UUID REFERENCES employees (id) ON DELETE SET NULL`.execute(db);
    await sql`CREATE UNIQUE INDEX sales_reps_employee_idx ON sales_reps (employee_id) WHERE employee_id IS NOT NULL`.execute(db);
  },
};

export default migration;
