import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { CurrencyConversionService } from './currency-conversion.service';

export interface LedgerAmount {
  amountMinorUnits: string;
  tenantCurrency: string;
  wasConverted: boolean;
}

/**
 * A source document's amount in the tenant's ledger currency, at the
 * document's own date — the one conversion every auto-posting listener
 * uses (claude/multi-currency-strategy.md §1, §3). A no-op (rate 1) when
 * the document is already in the tenant currency; EXCHANGE_RATE.NOT_AVAILABLE
 * when no rate covers the date (the outbox retries, then shows it failed).
 */
@Injectable()
export class LedgerAmountService {
  constructor(
    private readonly tenantSettings: TenantSettingsService,
    private readonly currencyConversion: CurrencyConversionService,
  ) {}

  async toLedger(
    db: Kysely<TenantDatabase>,
    amount: { amountMinorUnits: string; currency: string },
    asOfDate: string,
  ): Promise<LedgerAmount> {
    const tenantSettings = await this.tenantSettings.get(db);
    const sourceAmount = Money.fromMinorUnits(BigInt(amount.amountMinorUnits), amount.currency);
    const { convertedAmount } = await this.currencyConversion.convert(
      db,
      sourceAmount,
      tenantSettings.currencyCode,
      asOfDate,
    );
    return {
      amountMinorUnits: convertedAmount.toMinorUnits().toString(),
      tenantCurrency: tenantSettings.currencyCode,
      wasConverted: amount.currency !== tenantSettings.currencyCode,
    };
  }
}
