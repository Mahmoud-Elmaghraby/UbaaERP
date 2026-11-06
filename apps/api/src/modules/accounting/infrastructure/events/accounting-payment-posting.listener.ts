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
  allocations?: { allocationId?: string; salesInvoiceId: string; allocatedAmount: { amountMinorUnits: string; currency: string } }[];
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
  /** A customer cheque endorsed over to the supplier (migration 0112) — paid out of أوراق قبض. */
  endorsedChequeId?: string | null;
  amount: { amountMinorUnits: string; currency: string };
  allocations?: { allocationId?: string; purchaseInvoiceId: string; allocatedAmount: { amountMinorUnits: string; currency: string } }[];
}

/** CustomerRefundsService's outbox metadata (sales.customer_refund.posted / .cancelled). */
export interface CustomerRefundMetadata {
  refundNumber: string;
  refundDate: string;
  paymentMethod?: string;
  treasuryId: string | null;
  amount: { amountMinorUnits: string; currency: string };
}

/** Outbox metadata of a cheque status change (sales.cheque.* / purchases.cheque.*). */
export interface ChequeEventMetadata {
  paymentNumber: string;
  chequeNumber: string | null;
  /** The status date (collection / bounce / clearing). */
  date: string;
  /** The receipt's / payment's own date — the rate the cheque entered the ledger at. */
  paymentDate: string | null;
  treasuryId: string | null;
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
    // A cheque isn't money in the bank yet: it waits in أوراق قبض until collected.
    const treasury =
      metadata.paymentMethod === 'check'
        ? required(settings.notesReceivableAccountId, 'حساب أوراق القبض')
        : await this.treasuryAccount(db, settings, metadata);

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
    await this.postExchangeDifferences(db, 'customer', payload.entityId, entryDate, metadata.allocations ?? []);
  }

  /** A later allocation of a posted customer payment to more invoices. */
  @OnOutboxEvent('sales.payment_received.allocated', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handlePaymentReceivedAllocated(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as Pick<PaymentPostedMetadata, 'allocations'> | undefined;
    if (!metadata?.allocations?.length) return;
    const db = this.connections.getClient(payload.schema);
    const row = await db.selectFrom('payments_received').select('payment_date').where('id', '=', payload.entityId).executeTakeFirst();
    const paymentDate = row?.payment_date ? calendarDate(row.payment_date) : localIsoDate(payload.occurredAt);
    await this.postExchangeDifferences(db, 'customer', payload.entityId, paymentDate, metadata.allocations);
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
    // An endorsed customer cheque leaves أوراق قبض; our own cheque waits in أوراق دفع until the bank pays it.
    const treasury = metadata.endorsedChequeId
      ? required(settings.notesReceivableAccountId, 'حساب أوراق القبض')
      : metadata.paymentMethod === 'check'
        ? required(settings.notesPayableAccountId, 'حساب أوراق الدفع')
        : await this.treasuryAccount(db, settings, metadata);

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
    await this.postExchangeDifferences(db, 'supplier', payload.entityId, entryDate, metadata.allocations ?? []);
  }

  /** Money paid back to a customer: Dr Receivables / Cr the treasury it left (a cancellation reverses it). */
  @OnOutboxEvent('sales.customer_refund.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handleCustomerRefund(payload: DomainEventPayload): Promise<void> {
    return this.postRefund(payload, false);
  }

  @OnOutboxEvent('sales.customer_refund.cancelled', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handleCustomerRefundCancelled(payload: DomainEventPayload): Promise<void> {
    return this.postRefund(payload, true);
  }

  private async postRefund(payload: DomainEventPayload, reverse: boolean): Promise<void> {
    const m = payload.metadata as unknown as CustomerRefundMetadata | undefined;
    if (!m?.amount || m.amount.amountMinorUnits === '0') return;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const receivable = required(settings.accountsReceivableAccountId, 'حساب العملاء');
    const treasury = await this.treasuryAccount(db, settings, m);
    const { amountMinorUnits } = await this.ledgerAmounts.toLedger(db, m.amount, m.refundDate);
    const [debitAccount, creditAccount] = reverse ? [treasury, receivable] : [receivable, treasury];
    await this.journalEntries.createAuto(db, {
      entryDate: m.refundDate,
      description: reverse ? `إلغاء رد مبلغ لعميل — ${m.refundNumber}` : `رد مبلغ لعميل — ${m.refundNumber}`,
      lines: [
        { accountId: debitAccount, debitAmountMinorUnits: amountMinorUnits, creditAmountMinorUnits: '0' },
        { accountId: creditAccount, debitAmountMinorUnits: '0', creditAmountMinorUnits: amountMinorUnits },
      ],
      sourceReferenceType: reverse ? 'customer_refund_cancel' : 'customer_refund',
      sourceReferenceId: payload.entityId,
    });
  }

  /** A received cheque was collected: أوراق قبض → the bank it was deposited in. */
  @OnOutboxEvent('sales.cheque.collected', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleChequeCollected(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as ChequeEventMetadata;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const bank = await this.treasuryAccount(db, settings, { treasuryId: m.treasuryId, paymentMethod: 'bank_transfer' });
    await this.postCheque(db, payload, m, bank, required(settings.notesReceivableAccountId, 'حساب أوراق القبض'), 'cheque_collected', `تحصيل شيك ${m.chequeNumber ?? ''} — ${m.paymentNumber}`);
  }

  /** A received cheque bounced: the customer owes it again (أوراق قبض → العملاء). */
  @OnOutboxEvent('sales.cheque.bounced', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleChequeBounced(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as ChequeEventMetadata;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    await this.postCheque(
      db,
      payload,
      m,
      required(settings.accountsReceivableAccountId, 'حساب العملاء'),
      required(settings.notesReceivableAccountId, 'حساب أوراق القبض'),
      'cheque_bounced',
      `شيك مرتد ${m.chequeNumber ?? ''} — ${m.paymentNumber}`,
    );
  }

  /** An issued cheque cleared: أوراق دفع → the bank account it was drawn on. */
  @OnOutboxEvent('purchases.cheque.cleared', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleChequeCleared(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as ChequeEventMetadata;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const bank = await this.treasuryAccount(db, settings, { treasuryId: m.treasuryId, paymentMethod: 'bank_transfer' });
    await this.postCheque(db, payload, m, required(settings.notesPayableAccountId, 'حساب أوراق الدفع'), bank, 'cheque_cleared', `صرف شيك ${m.chequeNumber ?? ''} — ${m.paymentNumber}`);
  }

  /** One cheque status entry: debit / credit the cheque amount, at the original payment's rate. */
  private async postCheque(
    db: Kysely<TenantDatabase>,
    payload: DomainEventPayload,
    m: ChequeEventMetadata,
    debitAccountId: string,
    creditAccountId: string,
    sourceReferenceType: string,
    description: string,
  ): Promise<void> {
    if (!m?.amount || m.amount.amountMinorUnits === '0') return;
    const { amountMinorUnits } = await this.ledgerAmounts.toLedger(db, m.amount, m.paymentDate ?? m.date);
    await this.journalEntries.createAuto(db, {
      entryDate: m.date,
      description,
      lines: [
        { accountId: debitAccountId, debitAmountMinorUnits: amountMinorUnits, creditAmountMinorUnits: '0' },
        { accountId: creditAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: amountMinorUnits },
      ],
      sourceReferenceType,
      sourceReferenceId: payload.entityId,
    });
  }

  /** A later allocation of a posted supplier payment to more invoices. */
  @OnOutboxEvent('purchases.supplier_payment.allocated', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleSupplierPaymentAllocated(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as Pick<SupplierPaymentPostedMetadata, 'allocations'> | undefined;
    if (!metadata?.allocations?.length) return;
    const db = this.connections.getClient(payload.schema);
    const row = await db.selectFrom('supplier_payments').select('payment_date').where('id', '=', payload.entityId).executeTakeFirst();
    const paymentDate = row?.payment_date ? calendarDate(row.payment_date) : localIsoDate(payload.occurredAt);
    await this.postExchangeDifferences(db, 'supplier', payload.entityId, paymentDate, metadata.allocations);
  }

  /**
   * فروق العملة المحققة. A foreign-currency invoice entered the receivable
   * (payable) at its own date's rate; the payment settling it left at the
   * payment date's rate. For each allocation the difference between the
   * two goes to the exchange gain/loss account, so the customer (supplier)
   * balance in the ledger ends at zero once the invoice is fully paid.
   * One entry per payment and invoice ('payment_fx:<invoice>' / payment).
   */
  private async postExchangeDifferences(
    db: Kysely<TenantDatabase>,
    party: 'customer' | 'supplier',
    paymentId: string,
    paymentDate: string,
    allocations: { allocationId?: string; salesInvoiceId?: string; purchaseInvoiceId?: string; allocatedAmount: { amountMinorUnits: string; currency: string } }[],
  ): Promise<void> {
    if (allocations.length === 0) return;
    const settings = await this.accountingSettings.get(db);
    for (const allocation of allocations) {
      const invoiceId = allocation.salesInvoiceId ?? allocation.purchaseInvoiceId;
      const amount = allocation.allocatedAmount;
      if (!invoiceId || amount.amountMinorUnits === '0') continue;
      const invoice =
        party === 'customer'
          ? await db.selectFrom('sales_invoices').select(['invoice_date', 'created_at']).where('id', '=', invoiceId).executeTakeFirst()
          : await db.selectFrom('purchase_invoices').select(['invoice_date', 'created_at']).where('id', '=', invoiceId).executeTakeFirst();
      if (!invoice) continue;
      const invoiceDate = invoice.invoice_date ? calendarDate(invoice.invoice_date) : localIsoDate(invoice.created_at);
      const atInvoice = await this.ledgerAmounts.toLedger(db, amount, invoiceDate);
      if (!atInvoice.wasConverted) continue;
      const atPayment = await this.ledgerAmounts.toLedger(db, amount, paymentDate);
      // > 0: the payment moved more local currency than the invoice booked.
      const diff = BigInt(atPayment.amountMinorUnits) - BigInt(atInvoice.amountMinorUnits);
      if (diff === 0n) continue;
      const fx = required(settings.exchangeGainLossAccountId, 'حساب أرباح وخسائر فروق العملة');
      const partyAccount =
        party === 'customer'
          ? required(settings.accountsReceivableAccountId, 'حساب العملاء')
          : required(settings.accountsPayableAccountId, 'حساب الموردين');
      const abs = (diff < 0n ? -diff : diff).toString();
      // Customer: AR was credited by the payment's value — more than booked → debit AR back (gain).
      // Supplier: AP was debited by the payment's value — more than booked → credit AP back (loss).
      const partyDebit = party === 'customer' ? diff > 0n : diff < 0n;
      await this.journalEntries.createAuto(db, {
        entryDate: paymentDate,
        description: `فرق عملة محقق — ${amount.currency}`,
        lines: partyDebit
          ? [
              { accountId: partyAccount, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
              { accountId: fx, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
            ]
          : [
              { accountId: fx, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
              { accountId: partyAccount, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
            ],
        // One difference per allocation: a second allocation to the same invoice is its own entry.
        sourceReferenceType: `payment_fx:${allocation.allocationId ?? invoiceId}`,
        sourceReferenceId: paymentId,
      });
    }
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

/** YYYY-MM-DD of a DATE column (pg hands it back as a local-midnight Date despite the string type). */
function calendarDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}
