import { Module } from '@nestjs/common';
import { TenancyModule } from './shared/tenancy/tenancy.module';
import { SettingsModule } from './modules/settings/settings.module';

/**
 * Root application module for the ERP API.
 *
 * Business modules are registered here as they are implemented, in the
 * build order fixed by CLAUDE.md §10: Settings + Users & Permissions →
 * Inventory → Purchases → Sales → Accounting. Settings is the first.
 */
@Module({
  imports: [TenancyModule, SettingsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
