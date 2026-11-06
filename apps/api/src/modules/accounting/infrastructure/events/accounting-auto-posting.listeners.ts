import { resolveTreasuryAccount } from '../../application/services/treasury-account-resolver';
import { localIsoDate } from '../../../../shared/time/local-date';
import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { CurrencyConversionService } from '../../application/services/currency-conversion.service';
import { LedgerAmountService, type LedgerAmount } from '../../application/services/ledger-amount.service';
import { BusinessRuleError } from '../../application/errors';
import { stockItemVariantIds } from '../../../../shared/catalog/stock-item-reader';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';
import type {
  PurchasePriceDifference,
  ReceiptInvoiceDifference,
} from '../../../../shared/events/purchase-price-difference';

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
  creditNoteNumber?: string;
  customerId: string;
  currency: string;
  totalAmount: { amountMinorUnits: string; currency: string };
  /** Since migration 0092 — see InvoicePostedMetadata. */
  netAmount?: { amountMinorUnits: string; currency: string };
  tableTaxAmount?: { amountMinorUnits: string; currency: string };
  vatAmount?: { amountMinorUnits: string; currency: string };
  withholdingAmount?: { amountMinorUnits: string; currency: string };
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
  /** Present on events written after 2026-10-08; the entry is dated on the invoice, not on when it was posted. */
  invoiceNumber?: string;
  invoiceDate?: string | null;
  /** Present since migration 0092 (invoice taxes); absent = the whole total is revenue / expense. */
  netAmount?: { amountMinorUnits: string; currency: string };
  tableTaxAmount?: { amountMinorUnits: string; currency: string };
  vatAmount?: { amountMinorUnits: string; currency: string };
  withholdingAmount?: { amountMinorUnits: string; currency: string };
}

interface PurchaseInvoicePostedMetadata extends InvoicePostedMetadata {
  supplierInvoiceNumber?: string | null;
  lines?: {
    productVariantId: string;
    quantity: number;
    /** Absent on debit-note lines. */
    unitPrice?: { amountMinorUnits: string; currency: string };
    /** Since migration 0092: the line's amount before taxes. */
    netAmount?: { amountMinorUnits: string; currency: string };
    /** Invoice: the net at the invoice rate, converted per line by Purchases (absent on older events). */
    ledgerNetAmount?: { amountMinorUnits: string; currency: string };
    /** Debit note: date of the posted invoice this line reverses. */
    sourceInvoiceDate?: string;
  }[];
  /** Invoice: per matched line, the price / exchange split (see PurchasePriceDifference). */
  priceDifferences?: PurchasePriceDifference[];
  /** Debit note: date of the (latest) posted invoice it reverses — the payable's rate. */
  sourceInvoiceDate?: string;
}

/** GoodsReceiptsService.confirm()'s outbox metadata — only what the exchange-difference entry needs. */
interface GoodsReceiptConfirmedMetadata {
  receiptNumber?: string;
  receivedDate?: string | null;
  /** Goods billed by a posted invoice before they arrived (absent on older events). */
  invoicedDifferences?: ReceiptInvoiceDifference[];
}

/** PosSessionsService.close()'s outbox metadata (sales.pos_session.closed) — see that method's own comment. */
interface PosSessionClosedMetadata {
  cashierUserId: string;
  /** Since migration 0095 — the session's cash box. */
  treasuryId?: string | null;
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
  private convertToTenantCurrency(
    db: Kysely<TenantDatabase>,
    amount: { amountMinorUnits: string; currency: string },
    asOfDate: string,
  ): Promise<LedgerAmount> {
    return new LedgerAmountService(this.tenantSettings, this.currencyConversion).toLedger(db, amount, asOfDate);
  }

  /** The invoice's taxes in the ledger currency (zero for invoices from before migration 0092). */
  private async convertTaxes(
    db: Kysely<TenantDatabase>,
    metadata: Pick<InvoicePostedMetadata, 'vatAmount' | 'tableTaxAmount' | 'withholdingAmount'>,
    entryDate: string,
  ): Promise<{ vat: bigint; table: bigint; withholding: bigint }> {
    const convert = async (amount: { amountMinorUnits: string; currency: string } | undefined) =>
      amount && amount.amountMinorUnits !== '0'
        ? BigInt((await this.convertToTenantCurrency(db, amount, entryDate)).amountMinorUnits)
        : 0n;
    return {
      vat: await convert(metadata.vatAmount),
      table: await convert(metadata.tableTaxAmount),
      withholding: await convert(metadata.withholdingAmount),
    };
  }

  private mapped(accountId: string | null, key: string): string {
    if (!accountId) {
      throw new BusinessRuleError(`accounting_settings.${key} is not configured.`, {
        code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
        params: { account: TAX_ACCOUNT_LABELS[key] ?? key },
      });
    }
    return accountId;
  }

  /** COGS recognition: debit COGS, credit Inventory. */
  @OnOutboxEvent('inventory.stock_consumption.recorded', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
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
      entryDate: localIsoDate(payload.occurredAt),
      description: `تكلفة البضاعة المباعة — ${referenceLabel(metadata.referenceType)} ${metadata.referenceId}`,
      lines,
      sourceReferenceType: 'stock_consumption',
      sourceReferenceId: metadata.referenceId,
    });
  }

  /** The reverse of COGS recognition, for goods physically returned: debit Inventory, credit COGS. */
  @OnOutboxEvent('inventory.stock_restoration.recorded', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
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
      entryDate: localIsoDate(payload.occurredAt),
      description: `عكس تكلفة البضاعة المباعة — ${referenceLabel(metadata.referenceType)} ${metadata.referenceId}`,
      lines,
      sourceReferenceType: 'stock_restoration',
      sourceReferenceId: metadata.referenceId,
    });
  }

  /** Revenue reversal for a sales credit note: debit Sales Returns & Allowances (contra-revenue), credit Accounts Receivable. */
  @OnOutboxEvent('sales.sales_credit_note.issued', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
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

    const entryDate = localIsoDate(payload.occurredAt);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.convertToTenantCurrency(
      db,
      metadata.totalAmount,
      entryDate,
    );

    // The exact reverse of the invoice's share: Dr returns (net) + output VAT + table tax /
    // Cr receivables (total) + the withholding receivable the customer no longer keeps.
    const taxes = await this.convertTaxes(db, metadata, entryDate);
    const returnsNet = BigInt(amountMinorUnits) + taxes.withholding - taxes.vat - taxes.table;
    const lines = compactLines([
      { accountId: settings.salesReturnsContraAccountId, debit: returnsNet },
      { accountId: taxes.vat ? this.mapped(settings.vatOutputAccountId, 'vatOutput') : '', debit: taxes.vat },
      {
        accountId: taxes.table ? this.mapped(settings.tableTaxOutputAccountId, 'tableTaxOutput') : '',
        debit: taxes.table,
      },
      {
        accountId: taxes.withholding
          ? this.mapped(settings.withholdingReceivableAccountId, 'withholdingReceivable')
          : '',
        credit: taxes.withholding,
      },
      { accountId: settings.accountsReceivableAccountId, credit: BigInt(amountMinorUnits) },
    ]);

    await this.journalEntries.createAuto(db, {
      entryDate,
      description:
        `إشعار دائن — مرتجع مبيعات ${metadata.creditNoteNumber ?? metadata.salesReturnId}` +
        conversionNote(wasConverted, metadata.totalAmount.currency, tenantCurrency),
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
  @OnOutboxEvent('sales.sales_invoice.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
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

    const entryDate = metadata.invoiceDate ?? localIsoDate(payload.occurredAt);
    const { amountMinorUnits, tenantCurrency, wasConverted } = await this.convertToTenantCurrency(
      db,
      metadata.totalAmount,
      entryDate,
    );

    // Dr receivables (what the customer owes) + withholding the customer keeps for the
    // tax authority / Cr output VAT, table tax, and revenue = the rest (so the entry
    // balances to the piaster even after currency conversion).
    const taxes = await this.convertTaxes(db, metadata, entryDate);
    const revenue =
      BigInt(amountMinorUnits) + taxes.withholding - taxes.vat - taxes.table;
    const lines = compactLines([
      { accountId: settings.accountsReceivableAccountId, debit: BigInt(amountMinorUnits) },
      {
        accountId: taxes.withholding ? this.mapped(settings.withholdingReceivableAccountId, 'withholdingReceivable') : '',
        debit: taxes.withholding,
      },
      { accountId: taxes.vat ? this.mapped(settings.vatOutputAccountId, 'vatOutput') : '', credit: taxes.vat },
      {
        accountId: taxes.table ? this.mapped(settings.tableTaxOutputAccountId, 'tableTaxOutput') : '',
        credit: taxes.table,
      },
      { accountId: settings.revenueAccountId, credit: revenue },
    ]);

    await this.journalEntries.createAuto(db, {
      entryDate,
      description:
        `فاتورة بيع ${metadata.invoiceNumber ?? payload.entityId}` +
        conversionNote(wasConverted, metadata.totalAmount.currency, tenantCurrency),
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
  @OnOutboxEvent('purchases.purchase_invoice.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handlePurchaseInvoicePosted(payload: DomainEventPayload): Promise<void> {
    return this.postPurchaseDocument(payload, false);
  }

  /**
   * Purchase debit note (إشعار خصم — a purchase return of invoiced goods):
   * the exact mirror of the invoice entry — Dr Accounts Payable (and
   * withholding), Cr GRNI / purchase expense, VAT input, table tax. The
   * goods themselves already left Inventory against GRNI (purchase_return
   * valuation entry), so GRNI nets out.
   */
  @OnOutboxEvent('purchases.purchase_debit_note.issued', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handlePurchaseDebitNoteIssued(payload: DomainEventPayload): Promise<void> {
    return this.postPurchaseDocument(payload, true);
  }

  private async postPurchaseDocument(payload: DomainEventPayload, isDebitNote: boolean): Promise<void> {
    const metadata = payload.metadata as unknown as PurchaseInvoicePostedMetadata | undefined;
    if (!metadata) {
      this.logger.warn(`Received '${isDebitNote ? 'purchase_debit_note' : 'purchase_invoice'}' event with no metadata — ignoring.`);
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
      stockPartMinorUnits += lineNet(line);
    }
    // Net of taxes: invoices from before migration 0092 have no netAmount and their whole total is net.
    const netMinorUnits = BigInt((metadata.netAmount ?? metadata.totalAmount).amountMinorUnits);
    const stockCapped = stockPartMinorUnits > netMinorUnits;
    if (stockCapped) stockPartMinorUnits = netMinorUnits;
    const expensePartMinorUnits = netMinorUnits - stockPartMinorUnits;

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

    const entryDate = metadata.invoiceDate ?? localIsoDate(payload.occurredAt);
    // A debit note reverses its invoice at the rate the invoice was booked at (the payable and
    // GRNI then clear exactly); the entry itself stays on the note's own date.
    const rateDate = isDebitNote ? (metadata.sourceInvoiceDate ?? entryDate) : entryDate;
    const currency = metadata.totalAmount.currency;
    const converted = await this.convertToTenantCurrency(db, metadata.totalAmount, rateDate);
    // Convert the stock part on its own; the expense part takes the rest so the entry balances exactly.
    const convertedStock =
      stockPartMinorUnits === 0n
        ? 0n
        : stockPartMinorUnits === BigInt(metadata.totalAmount.amountMinorUnits)
          ? BigInt(converted.amountMinorUnits)
          : BigInt(
              (
                await this.convertToTenantCurrency(
                  db,
                  { amountMinorUnits: stockPartMinorUnits.toString(), currency },
                  rateDate,
                )
              ).amountMinorUnits,
            );
    // Within the stock part: GRNI gets exactly what receipts credited it with (+ the price
    // differences Inventory moves out of it); the rest is an exchange difference (IAS 21) —
    // the receipt-to-invoice rate movement plus any per-line rounding.
    const grni =
      convertedStock === 0n || stockCapped
        ? convertedStock
        : await this.grniPart(db, metadata, stockItems, convertedStock, rateDate, isDebitNote, converted.wasConverted);
    const exchangeDifference = convertedStock - grni;
    const documentNumber = metadata.invoiceNumber ?? payload.entityId;

    // Dr GRNI (stock) + exchange difference + purchase expense (the rest) + input VAT + table tax /
    // Cr payables (what we owe) + withholding we keep for the tax authority.
    // The expense line takes whatever balances the entry after conversion.
    const taxes = await this.convertTaxes(db, metadata, rateDate);
    const payable = BigInt(converted.amountMinorUnits);
    const convertedExpense = payable + taxes.withholding - taxes.vat - taxes.table - convertedStock;
    const invoiceLines = compactLines([
      { accountId: grni ? settings.grniAccountId! : '', debit: grni },
      {
        accountId: exchangeDifference ? this.mapped(settings.exchangeGainLossAccountId, 'exchangeGainLoss') : '',
        debit: exchangeDifference,
        description: `فرق عملة — ${isDebitNote ? 'إشعار خصم مورد' : 'فاتورة شراء'} ${documentNumber}`,
      },
      {
        accountId: convertedExpense ? this.mapped(settings.purchaseExpenseAccountId, 'purchaseExpense') : '',
        debit: convertedExpense,
      },
      { accountId: taxes.vat ? this.mapped(settings.vatInputAccountId, 'vatInput') : '', debit: taxes.vat },
      {
        accountId: taxes.table
          ? this.mapped(settings.tableTaxInputAccountId ?? settings.purchaseExpenseAccountId, 'tableTaxInput')
          : '',
        debit: taxes.table,
      },
      {
        accountId: taxes.withholding ? this.mapped(settings.withholdingPayableAccountId, 'withholdingPayable') : '',
        credit: taxes.withholding,
      },
      { accountId: settings.accountsPayableAccountId, credit: payable },
    ]);
    // A debit note is the invoice entry with every side swapped.
    const lines = isDebitNote
      ? invoiceLines.map((line) => ({
          ...line,
          debitAmountMinorUnits: line.creditAmountMinorUnits,
          creditAmountMinorUnits: line.debitAmountMinorUnits,
        }))
      : invoiceLines;

    await this.journalEntries.createAuto(db, {
      entryDate,
      description:
        `${isDebitNote ? 'إشعار خصم مورد' : 'فاتورة شراء'} ${documentNumber}` +
        (metadata.supplierInvoiceNumber ? ` (فاتورة المورد ${metadata.supplierInvoiceNumber})` : '') +
        conversionNote(converted.wasConverted, currency, converted.tenantCurrency),
      lines,
      sourceReferenceType: isDebitNote ? 'purchase_debit_note' : 'purchase_invoice',
      sourceReferenceId: payload.entityId,
    });
  }

  /**
   * The GRNI side of a purchase document's stock lines (tenant currency).
   *
   * Invoice: Σ per-line ledger nets (Purchases converted each line at the
   * invoice rate) − the exchange differences of the matched quantity. With
   * Inventory's price-difference entry (Cr GRNI by the price part) GRNI is
   * then debited with exactly what the receipts credited for the matched
   * quantity, plus the full invoice-rate value of quantity not received
   * yet (which the receipt later clears — see handleGoodsReceiptConfirmed).
   *
   * Debit note (foreign currency): each line converted at its source
   * invoice's rate — the same value Inventory compares to the returned
   * goods' cost, so GRNI nets out.
   *
   * Events from before these fields existed: the whole converted stock part.
   */
  private async grniPart(
    db: Kysely<TenantDatabase>,
    metadata: PurchaseInvoicePostedMetadata,
    stockItems: ReadonlySet<string>,
    convertedStock: bigint,
    rateDate: string,
    isDebitNote: boolean,
    wasConverted: boolean,
  ): Promise<bigint> {
    const stockLines = (metadata.lines ?? []).filter((line) => stockItems.has(line.productVariantId));
    if (isDebitNote) {
      if (!wasConverted || stockLines.some((line) => !line.netAmount)) return convertedStock;
      let total = 0n;
      for (const line of stockLines) {
        const ledger = await this.convertToTenantCurrency(db, line.netAmount!, line.sourceInvoiceDate ?? rateDate);
        total += BigInt(ledger.amountMinorUnits);
      }
      return total;
    }
    if (stockLines.some((line) => !line.ledgerNetAmount)) return convertedStock;
    let total = 0n;
    for (const line of stockLines) total += BigInt(line.ledgerNetAmount!.amountMinorUnits);
    for (const difference of metadata.priceDifferences ?? []) {
      if (!stockItems.has(difference.productVariantId) || !difference.exchangeDifference) continue;
      total -= BigInt(difference.exchangeDifference.amountMinorUnits);
    }
    return total;
  }

  /**
   * Invoice before receipt: the invoice debited GRNI at its own value for
   * goods not received yet; the receipt credits it at the order price × its
   * own rate, and Inventory credits the price part (receipt valuation
   * entry). What is left is the exchange part — booked here:
   * Dr exchange gain/loss / Cr GRNI (a negative difference the other way).
   */
  @OnOutboxEvent('purchases.goods_receipt.confirmed', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleGoodsReceiptConfirmed(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as GoodsReceiptConfirmedMetadata | undefined;
    const differences = (metadata?.invoicedDifferences ?? []).filter(
      (difference) => difference.exchangeDifference && difference.exchangeDifference.amountMinorUnits !== '0',
    );
    if (differences.length === 0) return;

    const db = this.connections.getClient(payload.schema);
    // Service lines never went through GRNI (the invoice expensed them).
    const stockItems = await stockItemVariantIds(
      db,
      differences.map((difference) => difference.productVariantId),
    );
    const stockDifferences = differences.filter((difference) => stockItems.has(difference.productVariantId));
    const amount = stockDifferences.reduce((sum, d) => sum + BigInt(d.exchangeDifference!.amountMinorUnits), 0n);
    if (amount === 0n) return;

    const settings = await this.accountingSettings.get(db);
    const grni = this.mapped(settings.grniAccountId, 'grni');
    const fx = this.mapped(settings.exchangeGainLossAccountId, 'exchangeGainLoss');
    const invoiceNumbers = [...new Set(stockDifferences.map((d) => d.invoiceNumber ?? d.purchaseInvoiceId))].join('، ');
    const receipt = metadata!.receiptNumber ?? payload.entityId;

    await this.journalEntries.createAuto(db, {
      entryDate: metadata!.receivedDate ?? localIsoDate(payload.occurredAt),
      description: `فرق عملة — إذن استلام ${receipt} (فاتورة شراء ${invoiceNumbers})`,
      lines: compactLines([
        { accountId: fx, debit: amount },
        { accountId: grni, credit: amount },
      ]),
      sourceReferenceType: 'goods_receipt_exchange_difference',
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
  @OnOutboxEvent('sales.pos_session.closed', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
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
    if (!settings.cashOverShortAccountId) {
      throw new BusinessRuleError(
        'Cannot auto-post the POS cash session variance: accounting_settings has no ' +
          'cashOverShortAccountId configured yet. Configure it via the Accounting Settings screen first.',
      );
    }
    // The session's own cash box (its linked account, else the cash mapping).
    const cashAccountId = await resolveTreasuryAccount(db, settings, {
      treasuryId: metadata.treasuryId ?? null,
      paymentMethod: 'cash',
    });

    const isOver = varianceMinorUnits > 0n;
    const absMinorUnits = (isOver ? varianceMinorUnits : -varianceMinorUnits).toString();

    const lines: CreateJournalEntryLineInput[] = isOver
      ? [
          { accountId: cashAccountId, debitAmountMinorUnits: absMinorUnits, creditAmountMinorUnits: '0' },
          { accountId: settings.cashOverShortAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: absMinorUnits },
        ]
      : [
          { accountId: settings.cashOverShortAccountId, debitAmountMinorUnits: absMinorUnits, creditAmountMinorUnits: '0' },
          { accountId: cashAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: absMinorUnits },
        ];

    await this.journalEntries.createAuto(db, {
      entryDate: localIsoDate(payload.occurredAt),
      description: `${isOver ? 'زيادة' : 'عجز'} نقدية وردية نقطة البيع — ${payload.entityId}`,
      lines,
      sourceReferenceType: 'pos_session',
      sourceReferenceId: payload.entityId,
    });
  }
}

const REFERENCE_LABELS: Record<string, string> = {
  delivery: 'تسليم',
  sales_return: 'مرتجع مبيعات',
  pos_sale: 'بيع نقطة البيع',
};

function referenceLabel(referenceType: string | undefined): string {
  return (referenceType && REFERENCE_LABELS[referenceType]) ?? referenceType ?? '';
}

function conversionNote(wasConverted: boolean, from: string, to: string): string {
  return wasConverted ? ` (${from} → ${to})` : '';
}

const TAX_ACCOUNT_LABELS: Record<string, string> = {
  vatOutput: 'ضريبة القيمة المضافة - مخرجات',
  vatInput: 'ضريبة القيمة المضافة - مدخلات',
  tableTaxOutput: 'ضريبة الجدول على المبيعات',
  tableTaxInput: 'ضريبة الجدول على المشتريات',
  withholdingPayable: 'خصم من المنبع مستحق',
  withholdingReceivable: 'خصم من المنبع لدى العملاء',
  purchaseExpense: 'حساب مصروفات المشتريات',
  exchangeGainLoss: 'حساب أرباح وخسائر فروق العملة',
  grni: 'حساب بضاعة مستلمة لم تصل فواتيرها',
};

/** A purchase document line's net (document currency); lines before migration 0092: unit price × quantity. */
function lineNet(line: NonNullable<PurchaseInvoicePostedMetadata['lines']>[number]): bigint {
  if (line.netAmount) return BigInt(line.netAmount.amountMinorUnits);
  if (!line.unitPrice) return 0n;
  return Money.fromMinorUnits(BigInt(line.unitPrice.amountMinorUnits), line.unitPrice.currency)
    .multiplyByQuantity(line.quantity)
    .toMinorUnits();
}

/** Builds journal lines from signed parts, dropping zero amounts; a negative debit becomes a credit and vice versa. */
function compactLines(
  parts: { accountId: string; debit?: bigint; credit?: bigint; description?: string }[],
): CreateJournalEntryLineInput[] {
  const lines: CreateJournalEntryLineInput[] = [];
  for (const part of parts) {
    const net = (part.debit ?? 0n) - (part.credit ?? 0n);
    if (net === 0n) continue;
    const line: CreateJournalEntryLineInput =
      net > 0n
        ? { accountId: part.accountId, debitAmountMinorUnits: net.toString(), creditAmountMinorUnits: '0' }
        : { accountId: part.accountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: (-net).toString() };
    if (part.description) line.description = part.description;
    lines.push(line);
  }
  return lines;
}
