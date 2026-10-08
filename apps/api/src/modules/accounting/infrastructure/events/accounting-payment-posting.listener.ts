import { localIsoDate } from '../../../../shared/time/local-date';
import { Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { LedgerAmountService } from '../../application/services/ledger-amount.service';
import { BusinessRuleError } from '../../application/errors';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import { resolveTreasuryAccount } from '../../application/services/treasury-account-resolver';

/** PaymentsReceivedService.post()'s outbox metadata (sales.payment_received.posted). */
export interface PaymentPostedMetadata {
  customerId?: string;
  paymentNumber?: string;
  paymentDate?: string | null;
  paymentMethod?: string;
  treasuryId?: string | null;
  /** Outbox rows written before migration 0095. */
  bankAccountId?: string | null;
  amount: { amountMinorUnits: string; currency: string };
}

/** SupplierPaymentsService.post()'s outbox metadata (purchases.supplier_payment.posted). */
export interface SupplierPaymentPostedMetadata {
  supplierId?: string;
  paymentNumber?: string;
  paymentDate?: string | null;
  paymentMethod?: string;
  treasuryId?: string | null;
  /** Outbox rows written before migration 0095. */
  bankAccountId?: string | null;
  amount: { amountMinorUnits: string; currency: string };
}

/**
 * Money actually changing hands. A customer receipt debits where the money
 * went — the chosen bank account's ledger account, else cash for a cash
 * receipt, else the default bank account — and credits Accounts
 * Receivable for the whole amount (an unallocated remainder is simply the
 * customer's credit balance). Allocation to invoices is sub-ledger
 * bookkeeping in Sales and posts nothing.
 *
 * A supplier payment is the mirror: debit Accounts Payable for the whole
 * amount (an unallocated remainder is an advance to the supplier) and
 * credit where the money came from, resolved the same way.
 */
@Injectable()
export class AccountingPaymentPostingListener {
  private readonly logger = new Logger(AccountingPaymentPostingListener.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    private readonly ledgerAmounts: LedgerAmountService,
  ) {}

  @OnOutboxEvent('sales.payment_received.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handlePaymentReceived(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as PaymentPostedMetadata | undefined;
    if (!metadata?.amount) {
      this.logger.warn(`Received 'sales.payment_received.posted' with no amount — ignoring.`);
      return;
    }
    if (metadata.amount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const receivable = required(settings.accountsReceivableAccountId, 'حساب العملاء');
    const treasury = await this.treasuryAccount(db, settings, metadata);

    const entryDate = metadata.paymentDate ?? localIsoDate(payload.occurredAt);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.ledgerAmounts.toLedger(
      db,
      metadata.amount,
      entryDate,
    );
    const number = metadata.paymentNumber ?? payload.entityId;
    await this.journalEntries.createAuto(db, {
      entryDate,
      description: wasConverted
        ? `تحصيل من عميل — ${number} (${metadata.amount.currency} → ${tenantCurrency})`
        : `تحصيل من عميل — ${number}`,
      lines: [
        { accountId: treasury, debitAmountMinorUnits: amountMinorUnits, creditAmountMinorUnits: '0' },
        { accountId: receivable, debitAmountMinorUnits: '0', creditAmountMinorUnits: amountMinorUnits },
      ],
      sourceReferenceType: 'payment_received',
      sourceReferenceId: payload.entityId,
    });
  }

  @OnOutboxEvent('purchases.supplier_payment.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleSupplierPayment(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as SupplierPaymentPostedMetadata | undefined;
    if (!metadata?.amount) {
      this.logger.warn(`Received 'purchases.supplier_payment.posted' with no amount — ignoring.`);
      return;
    }
    if (metadata.amount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const payable = required(settings.accountsPayableAccountId, 'حساب الموردين');
    const treasury = await this.treasuryAccount(db, settings, metadata);

    const entryDate = metadata.paymentDate ?? localIsoDate(payload.occurredAt);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.ledgerAmounts.toLedger(
      db,
      metadata.amount,
      entryDate,
    );
    const number = metadata.paymentNumber ?? payload.entityId;
    await this.journalEntries.createAuto(db, {
      entryDate,
      description: wasConverted
        ? `سداد لمورد — ${number} (${metadata.amount.currency} → ${tenantCurrency})`
        : `سداد لمورد — ${number}`,
      lines: [
        { accountId: payable, debitAmountMinorUnits: amountMinorUnits, creditAmountMinorUnits: '0' },
        { accountId: treasury, debitAmountMinorUnits: '0', creditAmountMinorUnits: amountMinorUnits },
      ],
      sourceReferenceType: 'supplier_payment',
      sourceReferenceId: payload.entityId,
    });
  }

  /** Where the money sits — see resolveTreasuryAccount. Old outbox rows carry `bankAccountId` (same ids). */
  private treasuryAccount(
    db: Kysely<TenantDatabase>,
    settings: AccountingSettings,
    metadata: { paymentMethod?: string; treasuryId?: string | null; bankAccountId?: string | null },
  ): Promise<string> {
    return resolveTreasuryAccount(db, settings, {
      treasuryId: metadata.treasuryId ?? metadata.bankAccountId ?? null,
      paymentMethod: metadata.paymentMethod,
    });
  }
}

function required(accountId: string | null, label: string): string {
  if (!accountId) {
    throw new BusinessRuleError(`Account mapping "${label}" is not configured.`, {
      code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
      params: { account: label },
    });
  }
  return accountId;
}
