import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { CurrencyConversionService } from '../../application/services/currency-conversion.service';
import { BusinessRuleError } from '../../application/errors';
import { stockItemVariantIds } from '../../../../shared/catalog/stock-item-reader';
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

/**
 * Shared shape of SalesInvoicesService.post()'s and
 * PurchaseInvoicesService.post()'s outbox metadata — only totalAmount is
 * actually needed here. `totalAmount.currency` is the invoice's own
 * currency (Customer/Supplier.defaultCurrency at the time it was
 * created — see currency-gate.ts) and is NOT assumed to already equal
 * the tenant's ledger currency; see convertToTenantCurrency() below.
 */
interface InvoicePostedMetadata {
  totalAmount: { amountMinorUnits: string; currency: string };
}

interface PurchaseInvoicePostedMetadata extends InvoicePostedMetadata {
  lines?: {
    productVariantId: string;
    quantity: number;
    unitPrice: { amountMinorUnits: string; currency: string };
  }[];
}

/** PosSessionsService.close()'s outbox metadata (sales.pos_session.closed) — see that method's own comment. */
interface PosSessionClosedMetadata {
  cashierUserId: string;
  varianceAmount: { amountMinorUnits: string; currency: string };
}

/**
 * Accounting Stages 6/7 and 3 (CLAUDE.md §10 — step 5): the auto-posting
 * listeners that make this module load-bearing instead of a standalone
 * ledger nobody writes to automatically. Six @OnEvent handlers, one
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
 *
 * Multi-currency Phase 3 (claude/multi-currency-strategy.md §1's
 * critical finding, closed here): the three handlers whose source
 * amount can legitimately carry a currency other than the tenant's own
 * (sales/purchase invoice posting, and a sales credit note issued
 * against a foreign-currency invoice) now route through
 * convertToTenantCurrency() before building any journal line, instead
 * of feeding the raw source-document amount straight into
 * debit/creditAmountMinorUnits as if it were already the tenant's
 * currency. The other three handlers (stock consumption/restoration,
 * POS cash variance) are deliberately left untouched — their source
 * amounts are inventory cost basis and physical cash, never a document
 * currency a customer/supplier chose, so they were never exposed to
 * this bug (see convertToTenantCurrency()'s own comment for the one
 * currently-open question this doesn't cover: whether a foreign-
 * currency Purchase Order/Invoice could itself skew Inventory's
 * weighted-average cost basis before it ever reaches this class —
 * flagged, not fixed, in claude/next-steps-backlog.md).
 */
@Injectable()
export class AccountingAutoPostingListeners {
  private readonly logger = new Logger(AccountingAutoPostingListeners.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly currencyConversion: CurrencyConversionService,
  ) {}

  /**
   * Converts a source document's amount into the tenant's own ledger
   * currency before it's used in any journal line — the fix for this
   * class's own long-flagged critical bug (claude/multi-currency-
   * strategy.md §1): previously every handler fed a source amount
   * straight into debit/creditAmountMinorUnits assuming it was already
   * in the tenant's currency, silently mis-posting any foreign-currency
   * invoice at face value with no conversion and no error.
   *
   * For the overwhelming majority of tenants (multi-currency left off,
   * per its own default — see currency-gate.ts) `amount.currency`
   * already equals the tenant's currency, and CurrencyConversionService
   * .convert() short-circuits to a no-op (rate "1") in that case — this
   * call is safe to make unconditionally rather than branching on
   * whether the currencies already match.
   *
   * `asOfDate` is deliberately the source event's own occurredAt date
   * (the same date already used for the journal entry itself), not
   * "today" — this is what locks the conversion to the moment the
   * source document was actually posted, matching SAP B1/Wafeq's own
   * documented behavior (strategy doc §3.1/§3.2), even if the Outbox
   * dispatcher happens to process this event somewhat later. When no
   * rate covers that date, this throws EXCHANGE_RATE.NOT_AVAILABLE
   * (via CurrencyConversionService) and propagates exactly like a
   * missing account mapping does elsewhere in this class — a visible,
   * retry-then-fail-loud outcome, never a silent guess.
   */
  private async convertToTenantCurrency(
    db: Kysely<TenantDatabase>,
    amount: { amountMinorUnits: string; currency: string },
    asOfDate: string,
  ): Promise<{ amountMinorUnits: string; tenantCurrency: string; wasConverted: boolean }> {
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

  /** COGS recognition: debit COGS, credit Inventory. */
  @OnOutboxEvent('inventory.stock_consumption.recorded')
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
  @OnOutboxEvent('inventory.stock_restoration.recorded')
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
  @OnOutboxEvent('sales.sales_credit_note.issued')
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

    const entryDate = payload.occurredAt.toISOString().slice(0, 10);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.convertToTenantCurrency(
      db,
      metadata.totalAmount,
      entryDate,
    );

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.salesReturnsContraAccountId,
        debitAmountMinorUnits: amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.accountsReceivableAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate,
      description: wasConverted
        ? `Sales credit note revenue reversal — sales return ${metadata.salesReturnId} ` +
          `(${metadata.totalAmount.currency} converted to ${tenantCurrency})`
        : `Sales credit note revenue reversal — sales return ${metadata.salesReturnId}`,
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
  @OnOutboxEvent('sales.sales_invoice.posted')
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

    const entryDate = payload.occurredAt.toISOString().slice(0, 10);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.convertToTenantCurrency(
      db,
      metadata.totalAmount,
      entryDate,
    );

    const lines: CreateJournalEntryLineInput[] = [
      {
        accountId: settings.accountsReceivableAccountId,
        debitAmountMinorUnits: amountMinorUnits,
        creditAmountMinorUnits: '0',
      },
      {
        accountId: settings.revenueAccountId,
        debitAmountMinorUnits: '0',
        creditAmountMinorUnits: amountMinorUnits,
      },
    ];

    await this.journalEntries.createAuto(db, {
      entryDate,
      description: wasConverted
        ? `Sales invoice revenue — invoice ${payload.entityId} (${metadata.totalAmount.currency} converted to ${tenantCurrency})`
        : `Sales invoice revenue — invoice ${payload.entityId}`,
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
  @OnOutboxEvent('purchases.purchase_invoice.posted')
  async handlePurchaseInvoicePosted(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as PurchaseInvoicePostedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'purchases.purchase_invoice.posted' with no metadata — ignoring.`);
      return;
    }
    if (metadata.totalAmount.amountMinorUnits === '0') return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);

    // Inventory step 4 (perpetual inventory): stock lines were already put
    // in stock by their goods receipt (Dr Inventory / Cr GRNI), so the
    // invoice clears GRNI for them; only non-stock lines (services) are an
    // expense. Events written before line details existed post everything
    // to expense, as before.
    const stockItems = metadata.lines?.length
      ? await stockItemVariantIds(
          db,
          metadata.lines.map((line) => line.productVariantId),
        )
      : new Set<string>();
    let stockPartMinorUnits = 0n;
    for (const line of metadata.lines ?? []) {
      if (!stockItems.has(line.productVariantId)) continue;
      stockPartMinorUnits += Money.fromMinorUnits(BigInt(line.unitPrice.amountMinorUnits), line.unitPrice.currency)
        .multiplyByQuantity(line.quantity)
        .toMinorUnits();
    }
    const totalMinorUnits = BigInt(metadata.totalAmount.amountMinorUnits);
    if (stockPartMinorUnits > totalMinorUnits) stockPartMinorUnits = totalMinorUnits;
    const expensePartMinorUnits = totalMinorUnits - stockPartMinorUnits;

    if (!settings.accountsPayableAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post purchase invoice: accounting_settings has no accountsPayableAccountId configured yet.',
        { code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING', params: { account: 'حساب الموردين (دائنون)' } },
      );
    }
    if (stockPartMinorUnits > 0n && !settings.grniAccountId) {
      throw new BusinessRuleError('Cannot auto-post purchase invoice: accounting_settings has no grniAccountId.', {
        code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
        params: { account: 'حساب بضاعة مستلمة لم تصل فواتيرها' },
      });
    }
    if (expensePartMinorUnits > 0n && !settings.purchaseExpenseAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post purchase invoice expense: accounting_settings has no purchaseExpenseAccountId configured yet. ' +
          'Configure it via the Accounting Settings screen first.',
        { code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING', params: { account: 'حساب مصروفات المشتريات' } },
      );
    }

    const entryDate = payload.occurredAt.toISOString().slice(0, 10);
    const currency = metadata.totalAmount.currency;
    const converted = await this.convertToTenantCurrency(db, metadata.totalAmount, entryDate);
    // Convert the stock part on its own; the expense part takes the rest so the entry balances exactly.
    const convertedStock =
      stockPartMinorUnits === 0n
        ? 0n
        : stockPartMinorUnits === totalMinorUnits
          ? BigInt(converted.amountMinorUnits)
          : BigInt(
              (
                await this.convertToTenantCurrency(
                  db,
                  { amountMinorUnits: stockPartMinorUnits.toString(), currency },
                  entryDate,
                )
              ).amountMinorUnits,
            );
    const convertedExpense = BigInt(converted.amountMinorUnits) - convertedStock;

    const lines: CreateJournalEntryLineInput[] = [];
    if (convertedStock > 0n) {
      lines.push({
        accountId: settings.grniAccountId!,
        debitAmountMinorUnits: convertedStock.toString(),
        creditAmountMinorUnits: '0',
      });
    }
    if (convertedExpense > 0n) {
      lines.push({
        accountId: settings.purchaseExpenseAccountId!,
        debitAmountMinorUnits: convertedExpense.toString(),
        creditAmountMinorUnits: '0',
      });
    }
    lines.push({
      accountId: settings.accountsPayableAccountId,
      debitAmountMinorUnits: '0',
      creditAmountMinorUnits: converted.amountMinorUnits,
    });

    await this.journalEntries.createAuto(db, {
      entryDate,
      description: converted.wasConverted
        ? `Purchase invoice — invoice ${payload.entityId} (${currency} converted to ${converted.tenantCurrency})`
        : `Purchase invoice — invoice ${payload.entityId}`,
      lines,
      sourceReferenceType: 'purchase_invoice',
      sourceReferenceId: payload.entityId,
    });
  }

  /**
   * POS feature Stage 1 (claude/sales-pos-research.md): a closed POS
   * session's counted-vs-expected cash variance. PosSessionsService
   * .close() only writes this outbox record when variance is non-zero
   * (see that method's own comment), so this handler never has to
   * special-case a zero variance itself.
   *
   * Over (counted > expected): debit Cash (the drawer actually holds
   * more than the books expected), credit Cash Over/Short (misc
   * income). Short (counted < expected): debit Cash Over/Short
   * (expense), credit Cash (the drawer holds less than expected).
   * Computed with plain BigInt, not Money — this file's other handlers
   * only ever see non-negative business amounts; variance is the one
   * value here that can legitimately be negative, so its sign is read
   * directly rather than introduced through a new dependency.
   */
  @OnOutboxEvent('sales.pos_session.closed')
  async handlePosSessionClosed(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as PosSessionClosedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received 'sales.pos_session.closed' with no metadata — ignoring.`);
      return;
    }

    const varianceMinorUnits = BigInt(metadata.varianceAmount.amountMinorUnits);
    if (varianceMinorUnits === 0n) return;

    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    if (!settings.cashAccountId || !settings.cashOverShortAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post the POS cash session variance: accounting_settings has no ' +
          'cashAccountId/cashOverShortAccountId configured yet. Configure both via the Accounting Settings screen first.',
      );
    }

    const isOver = varianceMinorUnits > 0n;
    const absMinorUnits = (isOver ? varianceMinorUnits : -varianceMinorUnits).toString();

    const lines: CreateJournalEntryLineInput[] = isOver
      ? [
          { accountId: settings.cashAccountId, debitAmountMinorUnits: absMinorUnits, creditAmountMinorUnits: '0' },
          { accountId: settings.cashOverShortAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: absMinorUnits },
        ]
      : [
          { accountId: settings.cashOverShortAccountId, debitAmountMinorUnits: absMinorUnits, creditAmountMinorUnits: '0' },
          { accountId: settings.cashAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: absMinorUnits },
        ];

    await this.journalEntries.createAuto(db, {
      entryDate: payload.occurredAt.toISOString().slice(0, 10),
      description: `POS cash session ${isOver ? 'overage' : 'shortage'} — session ${payload.entityId}`,
      lines,
      sourceReferenceType: 'pos_session',
      sourceReferenceId: payload.entityId,
    });
  }
}
