import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TenantMigration } from './migration.types';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Discovers tenant migration files, sorted by filename. Returns an empty
 * list when the directory has no migration files yet — expected right now
 * (see ./migrations/README.md); business modules add files here later.
 */
export function loadTenantMigrations(): TenantMigration[] {
  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'),
    );
  } catch {
    return [];
  }

  return files
    .sort()
    .map((file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(join(MIGRATIONS_DIR, file));
      const migration: TenantMigration = mod.default ?? mod;
      return migration;
    });
}
