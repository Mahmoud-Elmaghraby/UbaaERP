import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Audit log by user: the users screen shows each user's last sign-in and recent activity, and the
 * audit-log screen filters by user. 0013 only indexed the date and the entity. Index only — no data change.
 */
const migration: TenantMigration = {
  name: '0116_audit_log_user_index',
  async up(db) {
    await sql`CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id, action, created_at DESC)`.execute(db);
  },
};

export default migration;
