import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { BusinessRuleError } from '../../application/errors';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';

interface StockCostLine {
  productVariantId: string;
  quantity: number;
  unitCost: { amountMinorUnits: string; currency: string };
  totalCost: { amountMinorUnits: string; currency: string };
}

interface StockCostEventMetadata {
  referenceType: string;
  referenceId: string;
  warehouseId: string;
  currency: string;
  totalCost: { amountMinorUnits: string; currency: string };
  lines: StockCostLine[];
}

interface SalesCreditNoteIssuedMetadata {
  salesReturnId: string;
  customerId: string;
  currency: string;
  totalAmount: { amountMinorUnits: string; currency: string };
}

/** Shared shape of SalesInvoicesService.post()'s and PurchaseInvoicesService.post()'s outbox metadata — only totalAmount is actually needed here. */
interface InvoicePostedMetadata {
  totalAmount: { amountMinorUnits: string; currency: string };
}

/**
 * Accounting Stages 6/7 and 3 (CLAUDE.md §10 — step 5): the auto-posting
 * listeners that make this module load-bearing instead of a standalone
 * ledger nobody writes to automatically. Five @OnEvent handlers, one
 * journal entry each, all via JournalEntriesService.createAuto() (which
 * builds+validates the lines, creates a draft tagged source='auto', and
 * immediately posts it — see that method's own comment on why "for
 * review" staging isn't built yet).
 *
 * Every handler here is reached ONLY via events written to the Outbox
 * in the same transaction as their source business fact (Inventory's
 * DeliveryStockListener/SalesReturnStockListener, SalesReturnsService
 * .confirm() for the credit note, and — Stage 3 — SalesInvoicesService
 * .post()/PurchaseInvoicesService.post(), both of which were already
 * Outbox-backed since their own Stage 5/7 introduced the pattern, so no
 * upstream change was needed for these two handlers) — see each of
 * those classes' own comments. This is the actual reason errors are
 * deliberately left to PROPAGATE here (no try/catch swallowing, unlike
 * Inventory's own plain-Event-Bus listeners): OutboxDispatcherService
 * retries a thrown error up to MAX_ATTEMPTS before giving up and marking
 * the row 'failed' for manual attention — silently swallowing here would
 * throw away exactly the reliability guarantee the whole design is for.
 *
 * A missing default-account mapping (AccountingSettingsService) or a
 * closed accounting period surfaces as a thrown BusinessRuleError,
 * which is the correct, visible failure mode — not something to guess
 * around. Stage 3's purchase-invoice handler in particular will always
 * throw this until a tenant admin configures purchaseExpenseAccountId
 * by hand — see AccountingSettings' own comment on why that one field
 * is never auto-populated.
 */
@Injectable()
export class AccountingAutoPostingListeners {
  private readonly logger = new Logger(AccountingAutoPostingListeners.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
  ) {}

  /** COGS recognition: debit COGS, credit Inventory. */
  @OnEvent('inventory.stock_consumption.recorded')
  async handleStockConsumption(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as StockCostEventMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'inventory.stock_consumption.recorded' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalCost.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.cogsAccountId || !settings.inventoryAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post cost of goods sold: accounting_settings has no cogsAccountId/inventoryAccountId ' +
          'configured yet. Configure both via the Accounting Settings screen first.',
      );
    }

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.cogsAccountId,
        debitAmountMinorUnits: metadata.totalCost.amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.inventoryAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: metadata.totalCost.amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `Cost of goods sold — ${metadata.referenceType} ${metadata.referenceId}`,
      lines,
      sourceReferenceType: 'stock_consumption',
      sourceReferenceId: metadata.referenceId,
    });
  }

  /** The reverse of COGS recognition, for goods physically returned: debit Inventory, credit COGS. */
  @OnEvent('inventory.stock_restoration.recorded')
  async handleStockRestoration(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as StockCostEventMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'inventory.stock_restoration.recorded' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalCost.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.cogsAccountId || !settings.inventoryAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post the cost-of-goods-sold reversal: accounting_settings has no ' +
          'cogsAccountId/inventoryAccountId configured yet. Configure both via the Accounting Settings screen first.',
      );
    }

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.inventoryAccountId,
        debitAmountMinorUnits: metadata.totalCost.amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.cogsAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: metadata.totalCost.amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `Cost of goods sold reversal — ${metadata.referenceType} ${metadata.referenceId}`,
      lines,
      sourceReferenceType: 'stock_restoration',
      sourceReferenceId: metadata.referenceId,
    });
  }

  /** Revenue reversal for a sales credit note: debit Sales Returns & Allowances (contra-revenue), credit Accounts Receivable. */
  @OnEvent('sales.sales_credit_note.issued')
  async handleSalesCreditNoteIssued(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as SalesCreditNoteIssuedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'sales.sales_credit_note.issued' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalAmount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.salesReturnsContraAccountId || !settings.accountsReceivableAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post the sales credit note revenue reversal: accounting_settings has no ' +
          'salesReturnsContraAccountId/accountsReceivableAccountId configured yet. ' +
          'Configure both via the Accounting Settings screen first.',
      );
    }

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.salesReturnsContraAccountId,
        debitAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.accountsReceivableAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `Sales credit note revenue reversal — sales return ${metadata.salesReturnId}`,
      lines,
      sourceReferenceType: 'sales_credit_note',
      sourceReferenceId: payload.entityId,
    });
  }

  /**
   * Stage 3: revenue recognition for a posted Sales Invoice — debit
   * Accounts Receivable, credit Revenue. Reacts to
   * 'sales.sales_invoice.posted', which SalesInvoicesService.post() has
   * written to the Outbox since Sales' own Stage 5 — no upstream change
   * needed for this handler, unlike Stage 6/7's Inventory events.
   */
  @OnEvent('sales.sales_invoice.posted')
  async handleSalesInvoicePosted(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as InvoicePostedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'sales.sales_invoice.posted' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalAmount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.accountsReceivableAccountId || !settings.revenueAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post sales invoice revenue: accounting_settings has no ' +
          'accountsReceivableAccountId/revenueAccountId configured yet. ' +
          'Configure both via the Accounting Settings screen first.',
      );
    }

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.accountsReceivableAccountId,
        debitAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.revenueAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `Sales invoice revenue — invoice ${payload.entityId}`,
      lines,
      sourceReferenceType: 'sales_invoice',
      sourceReferenceId: payload.entityId,
    });
  }

  /**
   * Stage 3: expense recognition for a posted Purchase Invoice — debit
   * Purchase Expense, credit Accounts Payable. Reacts to
   * 'purchases.purchase_invoice.posted', which
   * PurchaseInvoicesService.post() has written to the Outbox since
   * Purchases' own Stage 7 — no upstream change needed for this handler
   * either. Will throw until purchaseExpenseAccountId is configured by
   * hand (see AccountingSettings' own comment — this mapping has no
   * safe default to auto-populate).
   */
  @OnEvent('purchases.purchase_invoice.posted')
  async handlePurchaseInvoicePosted(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as InvoicePostedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'purchases.purchase_invoice.posted' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalAmount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.purchaseExpenseAccountId || !settings.accountsPayableAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post purchase invoice expense: accounting_settings has no ' +
          'purchaseExpenseAccountId/accountsPayableAccountId configured yet. ' +
          'Configure both via the Accounting Settings screen first.',
      );
    }

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.purchaseExpenseAccountId,
        debitAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.accountsPayableAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: metadata.totalAmount.amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `Purchase invoice expense — invoice ${payload.entityId}`,
      lines,
      sourceReferenceType: 'purchase_invoice',
      sourceReferenceId: payload.entityId,
    });
  }
}
