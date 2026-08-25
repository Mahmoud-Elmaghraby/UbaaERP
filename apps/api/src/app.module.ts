import { Module } from '@nestjs/common';

/**
 * Root application module for the ERP API.
 *
 * Intentionally empty — this is foundation scaffolding only. Business
 * modules (Settings, Users & Permissions, Inventory, Purchases, Sales,
 * Accounting) are registered here as they are implemented, in the build
 * order fixed by CLAUDE.md §10. No module, database, or domain code
 * exists yet.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
