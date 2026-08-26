import { Global, Module } from '@nestjs/common';
import { TenantConnectionManager } from './tenant-connection-manager';

function mustGetDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The API cannot resolve tenant-schema connections without it.',
    );
  }
  return url;
}

/**
 * Global module: TenantConnectionManager is a single process-wide cache of
 * per-tenant Kysely clients (see tenant-connection-manager.ts) — every
 * business module needs it, so it's provided once here instead of each
 * module wiring its own DATABASE_URL factory.
 */
@Global()
@Module({
  providers: [
    {
      provide: TenantConnectionManager,
      useFactory: () => new TenantConnectionManager(mustGetDatabaseUrl()),
    },
  ],
  exports: [TenantConnectionManager],
})
export class TenancyModule {}
