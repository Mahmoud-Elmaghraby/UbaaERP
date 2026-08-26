# Tenant migrations

Empty for now — this directory holds the Settings module's (and every
later module's) Kysely tenant-schema migration files, per CLAUDE.md §3.

Each file must export a `TenantMigration` (see `../migration.types.ts`):

```ts
import type { TenantMigration } from '../migration.types';

const migration: TenantMigration = {
  name: '0001_create_tenant_settings',
  async up(db) {
    // db.schema.createTable(...)
  },
};

export default migration;
```

Files are discovered by `../load-migrations.ts`, sorted by filename, and
applied in that order — name them with a numeric prefix (`0001_`, `0002_`,
...) so ordering is unambiguous.
