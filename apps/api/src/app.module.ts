import { Module } from '@nestjs/common';
import { TenancyModule } from './shared/tenancy/tenancy.module';
import { AuthInfraModule } from './shared/auth/auth-infra.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersPermissionsModule } from './modules/users-permissions/users-permissions.module';

/**
 * Root application module for the ERP API.
 *
 * Business modules are registered here as they are implemented, in the
 * build order fixed by CLAUDE.md §10: Settings + Users & Permissions →
 * Inventory → Purchases → Sales → Accounting. Both step-1 modules are
 * now in place.
 */
@Module({
  imports: [TenancyModule, AuthInfraModule, SettingsModule, UsersPermissionsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
