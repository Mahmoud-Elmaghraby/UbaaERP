import { Module } from '@nestjs/common';
import { EventsModule } from './shared/events/events.module';
import { TenancyModule } from './shared/tenancy/tenancy.module';
import { PrismaModule } from './shared/database/prisma.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { SecretsEncryptionModule } from './shared/crypto/secrets-encryption.module';
import { AuthInfraModule } from './shared/auth/auth-infra.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersPermissionsModule } from './modules/users-permissions/users-permissions.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SalesModule } from './modules/sales/sales.module';
import { AccountingModule } from './modules/accounting/accounting.module';

/**
 * Root application module for the ERP API.
 *
 * Business modules are registered here as they are implemented, in the
 * build order fixed by CLAUDE.md §10: Settings + Users & Permissions →
 * Inventory → Purchases → Sales → Accounting. The first four are fully
 * built (backend + frontend) — see claude/purchases-module-status.md and
 * claude/sales-module-status.md. Accounting (step 5, the last module in
 * the fixed build order) has begun — Chart of Accounts + Fiscal
 * Years/Accounting Periods (Stage 1) so far, see
 * claude/accounting-module-status.md.
 *
 * EventsModule (the plain Event Bus, CLAUDE.md §2.6) is wired globally
 * starting from Inventory — the first module that needed cross-module
 * communication. PrismaModule + OutboxModule (the Outbox Pattern,
 * CLAUDE.md §2.7) are wired globally starting from Purchases Stage 7 —
 * the first genuinely financial event (purchase invoice posting).
 * SecretsEncryptionModule is wired globally starting from Sales — its
 * first consumer is ETA e-invoice credential storage (CLAUDE.md §8).
 */
@Module({
  imports: [
    EventsModule,
    TenancyModule,
    PrismaModule,
    OutboxModule,
    SecretsEncryptionModule,
    AuthInfraModule,
    SettingsModule,
    UsersPermissionsModule,
    InventoryModule,
    PurchasesModule,
    SalesModule,
    AccountingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
