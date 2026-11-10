import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import { CustomerLedgerSource } from '../../infrastructure/statements/customer-ledger.source';
import { evaluateCreditLimit, parseCreditLimitMode, type CreditLimitMode } from '../../domain/customer-credit';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { BusinessRuleError } from '../errors';

export interface CustomerCreditCheck {
  mode: CreditLimitMode;
  currency: string;
  limitMinor: bigint | null;
  balanceMinor: bigint;
  exposureMinor: bigint;
  exceeded: boolean;
  blocked: boolean;
  /** Walk-in / system default customer: never checked. */
  exempt: boolean;
}

/**
 * Customer credit limits (migration 0109). The balance is the customer
 * sub-ledger (same source as the statement / account summary): opening +
 * posted invoices − credit notes − posted receipts, in the customer's currency.
 * Called by SalesOrdersService.confirm() and SalesInvoicesService.post() only
 * when the request comes from a user (the controllers); POS and the automatic
 * order behind a direct invoice never go through it.
 */
@Injectable()
export class CustomerCreditService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly ledger: CustomerLedgerSource,
  ) {}

  async check(
    db: Kysely<TenantDatabase>,
    customerId: string,
    amount: { minor: bigint; currency: string } | null,
    canOverride: boolean,
  ): Promise<CustomerCreditCheck> {
    const customer = await db
      .selectFrom('customers')
      .select(['credit_limit_amount', 'default_currency', 'is_system_default'])
      .where('id', '=', customerId)
      .executeTakeFirst();
    if (!customer) throw entityNotFound('CUSTOMER', customerId);
    const mode = parseCreditLimitMode(await this.settings.get(db, 'sales.creditLimitMode'));
    const currency = customer.default_currency;
    const limitMinor = customer.credit_limit_amount === null ? null : BigInt(customer.credit_limit_amount);
    const exempt = customer.is_system_default;

    // Nothing to compute when the check can't apply.
    const skip = mode === 'off' || limitMinor === null || exempt;
    let balanceMinor = 0n;
    if (!skip) {
      const entries = await this.ledger.listEntries(db, customerId);
      balanceMinor = entries.filter((e) => e.currency === currency).reduce((sum, e) => sum + e.amountMinor, 0n);
    }
    // A document in another currency can't be compared to the limit without a rate — counted as 0.
    const amountMinor = amount && amount.currency === currency ? amount.minor : 0n;
    const result = evaluateCreditLimit({
      mode: skip ? 'off' : mode,
      limitMinor,
      balanceMinor,
      amountMinor,
      canOverride,
    });
    return { mode, currency, limitMinor, balanceMinor, ...result, exempt };
  }

  /** Throws CUSTOMER.CREDIT_LIMIT_EXCEEDED in 'block' mode unless the user may override. */
  async assertWithinLimit(
    db: Kysely<TenantDatabase>,
    customerId: string,
    amount: Money,
    canOverride: boolean,
  ): Promise<void> {
    const result = await this.check(db, customerId, { minor: amount.toMinorUnits(), currency: amount.currency }, canOverride);
    if (!result.blocked || result.limitMinor === null) return;
    const fmt = (minor: bigint) => Money.fromMinorUnits(minor, result.currency).toDecimalString();
    throw new BusinessRuleError(
      `Customer "${customerId}" would owe ${fmt(result.exposureMinor)} ${result.currency}, above the credit limit of ${fmt(result.limitMinor)}.`,
      {
        code: 'CUSTOMER.CREDIT_LIMIT_EXCEEDED',
        params: { limit: fmt(result.limitMinor), exposure: fmt(result.exposureMinor), currency: result.currency },
      },
    );
  }
}
