import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TreasuriesController } from './presentation/treasuries.controller';
import { TreasuryCategoriesController } from './presentation/treasury-categories.controller';
import { TreasuryVouchersController } from './presentation/treasury-vouchers.controller';
import { TreasuriesService } from './application/treasuries.service';
import { TreasuryCategoriesService } from './application/treasury-categories.service';
import { TreasuryVouchersService } from './application/treasury-vouchers.service';
import { TreasuryStatementService } from './application/treasury-statement.service';
import { TreasuryVoucherMovements } from './infrastructure/treasury-voucher-movements';
import { TreasuryPrintRegistration } from './infrastructure/treasury-print.registration';

/**
 * Treasury (الخزائن): cash boxes, banks and e-wallets, expense / income /
 * transfer vouchers, balances and statements. Integrates with the rest of
 * the system without importing it:
 *  - Sales and Purchases report their receipts/payments through
 *    TreasuryMovementRegistry (shared/treasury) — no import of them here;
 *  - Accounting (when enabled) listens to treasury.* outbox events and to
 *    the receipts/payments events, resolving each treasury's chart account
 *    (CLAUDE.md §2.6/§2.7 — Accounting is never called directly).
 * Core module: not plan-gated.
 */
@Module({
  imports: [SettingsModule],
  controllers: [TreasuriesController, TreasuryCategoriesController, TreasuryVouchersController],
  providers: [
    TreasuriesService,
    TreasuryCategoriesService,
    TreasuryVouchersService,
    TreasuryStatementService,
    TreasuryVoucherMovements,
    TreasuryPrintRegistration,
  ],
})
export class TreasuryModule {}
