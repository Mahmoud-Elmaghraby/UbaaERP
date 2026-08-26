import type { Kysely } from 'kysely';
import type { TenantDatabase } from './kysely-client';

/**
 * Contract every tenant migration file must satisfy. Files live in
 * ./migrations/, sorted and applied in filename order (CLAUDE.md §3).
 *
 * No migrations exist yet — this task builds the runner/provisioning
 * infrastructure only. Business modules (starting with Settings) add
 * their own numbered migration files here as a later, separate task.
 */
export interface TenantMigration {
  name: string;
  up: (db: Kysely<TenantDatabase>) => Promise<void>;
}
