import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { JournalEntriesService } from '../../application/services/journal-entries.service';
import type { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import type { CurrencyConversionService } from '../../application/services/currency-conversion.service';
import type { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import { BusinessRuleError } from '../../application/errors';
import { AccountingAutoPostingListeners } from './accounting-auto-posting.listeners';
import { stockItemVariantIds } from '../../../../shared/catalog/stock-item-reader';
import { applyRate } from '../../../../shared/catalog/currency-rate-reader';
import { Money as MoneyVO } from '@erp-platform/shared-kernel';

jest.mock('../../../../shared/catalog/stock-item-reader', () => ({ stockItemVariantIds: jest.fn() }));

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makePayload(metadata: Record<string, unknown>, overrides: Partial<DomainEventPayload> = {}): DomainEventPayload {
  return {
    schema: 'tenant_acme',
    entityType: 'sales_invoice',
    entityId: 'invoice-1',
    action: 'posted',
    actorUserId: 'user-1',
    metadata,
    occurredAt: new Date('2026-09-13T00:00:00Z'),
    ...overrides,
  };
}

function makeAccountingSettings(overrides: Partial<AccountingSettings> = {}): AccountingSettings {
  return {
    id: 'settings-1',
    accountsReceivableAccountId: 'ar-account',
    inventoryAccountId: 'inv-account',
    cogsAccountId: 'cogs-account',
    salesReturnsContraAccountId: 'contra-account',
    revenueAccountId: 'revenue-account',
    accountsPayableAccountId: 'ap-account',
    purchaseExpenseAccountId: 'expense-account',
    cashAccountId: 'cash-account',
    cashOverShortAccountId: 'cash-over-short-account',
    exchangeGainLossAccountId: null,
    grniAccountId: 'grni-account',
    inventoryAdjustmentAccountId: 'adjustment-account',
    openingBalanceEquityAccountId: 'opening-account',
    landedCostClearingAccountId: null,
    retainedEarningsAccountId: null,
    notesReceivableAccountId: null,
    employeeAdvancesAccountId: null,
    salariesExpenseAccountId: null,
    salariesPayableAccountId: null,
    notesPayableAccountId: null,
    requireEntryApproval: false,
    reviewAutoEntries: false,
    defaultBankAccountId: null,
    vatOutputAccountId: null,
    vatInputAccountId: null,
    tableTaxOutputAccountId: null,
    tableTaxInputAccountId: null,
    withholdingPayableAccountId: null,
    withholdingReceivableAccountId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AccountingAutoPostingListeners — multi-currency Phase 3 (invoice/credit-note handlers)', () => {
  let connections: jest.Mocked<TenantConnectionManager>;
  let journalEntries: jest.Mocked<JournalEntriesService>;
  let accountingSettings: jest.Mocked<AccountingSettingsService>;
  let tenantSettings: jest.Mocked<TenantSettingsService>;
  let currencyConversion: jest.Mocked<CurrencyConversionService>;
  let listeners: AccountingAutoPostingListeners;

  beforeEach(() => {
    connections = { getClient: jest.fn().mockReturnValue(FAKE_DB) } as unknown as jest.Mocked<TenantConnectionManager>;
    journalEntries = { createAuto: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<JournalEntriesService>;
    accountingSettings = { get: jest.fn().mockResolvedValue(makeAccountingSettings()) } as unknown as jest.Mocked<AccountingSettingsService>;
    tenantSettings = { get: jest.fn().mockResolvedValue({ currencyCode: 'EGP' }) } as unknown as jest.Mocked<TenantSettingsService>;
    currencyConversion = { convert: jest.fn() } as unknown as jest.Mocked<CurrencyConversionService>;

    listeners = new AccountingAutoPostingListeners(
      connections,
      journalEntries,
      accountingSettings,
      tenantSettings,
      currencyConversion,
    );
  });

  describe('handleSalesInvoicePosted', () => {
    it('passes the raw amount through unchanged when the invoice is already in the tenant currency', async () => {
      currencyConversion.convert.mockResolvedValue({
        convertedAmount: { toMinorUnits: () => 500000n } as unknown as Money,
        rateUsed: '1',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      });

      await listeners.handleSalesInvoicePosted(
        makePayload({ totalAmount: { amountMinorUnits: '500000', currency: 'EGP' } }),
      );

      expect(currencyConversion.convert).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ currency: 'EGP' }),
        'EGP',
        '2026-09-13',
      );
      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'ar-account', debitAmountMinorUnits: '500000', creditAmountMinorUnits: '0' }),
            expect.objectContaining({ accountId: 'revenue-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '500000' }),
          ],
          description: 'فاتورة بيع invoice-1',
        }),
      );
    });

    it('posts the CONVERTED amount, not the raw source amount, for a foreign-currency invoice', async () => {
      // 100.00 USD converted at 51.341 -> 5134.10 EGP (513410 minor units).
      currencyConversion.convert.mockResolvedValue({
        convertedAmount: { toMinorUnits: () => 513410n } as unknown as Money,
        rateUsed: '51.341',
        rateDate: '2026-09-13',
        rateSource: 'api',
      });

      await listeners.handleSalesInvoicePosted(
        makePayload({ totalAmount: { amountMinorUnits: '10000', currency: 'USD' } }),
      );

      expect(currencyConversion.convert).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ currency: 'USD' }),
        'EGP',
        '2026-09-13',
      );
      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'ar-account', debitAmountMinorUnits: '513410' }),
            expect.objectContaining({ accountId: 'revenue-account', creditAmountMinorUnits: '513410' }),
          ],
          description: 'فاتورة بيع invoice-1 (USD → EGP)',
        }),
      );
      // The critical regression this whole phase exists to prevent: the raw,
      // unconverted USD minor units must never reach a journal line.
      expect(journalEntries.createAuto).not.toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: expect.arrayContaining([expect.objectContaining({ debitAmountMinorUnits: '10000' })]),
        }),
      );
    });

    it('still throws when the account mapping is missing, before ever calling the conversion service', async () => {
      accountingSettings.get.mockResolvedValue(makeAccountingSettings({ revenueAccountId: null }));

      await expect(
        listeners.handleSalesInvoicePosted(makePayload({ totalAmount: { amountMinorUnits: '500000', currency: 'EGP' } })),
      ).rejects.toThrow(BusinessRuleError);
      expect(currencyConversion.convert).not.toHaveBeenCalled();
      expect(journalEntries.createAuto).not.toHaveBeenCalled();
    });

    it('skips entirely for a zero-amount invoice, without looking up a rate', async () => {
      await listeners.handleSalesInvoicePosted(
        makePayload({ totalAmount: { amountMinorUnits: '0', currency: 'USD' } }),
      );

      expect(currencyConversion.convert).not.toHaveBeenCalled();
      expect(journalEntries.createAuto).not.toHaveBeenCalled();
    });

    it('propagates EXCHANGE_RATE.NOT_AVAILABLE instead of guessing when no rate covers the invoice date', async () => {
      currencyConversion.convert.mockRejectedValue(
        new BusinessRuleError('No exchange rate available.', { code: 'EXCHANGE_RATE.NOT_AVAILABLE' }),
      );

      await expect(
        listeners.handleSalesInvoicePosted(makePayload({ totalAmount: { amountMinorUnits: '10000', currency: 'USD' } })),
      ).rejects.toThrow(BusinessRuleError);
      expect(journalEntries.createAuto).not.toHaveBeenCalled();
    });
  });

  describe('invoice taxes (migration 0092)', () => {
    const egp = (amount: string) => ({ amountMinorUnits: amount, currency: 'EGP' });
    const taxSettings = {
      vatOutputAccountId: 'vat-out',
      vatInputAccountId: 'vat-in',
      tableTaxOutputAccountId: 'table-out',
      tableTaxInputAccountId: 'table-in',
      withholdingPayableAccountId: 'wht-payable',
      withholdingReceivableAccountId: 'wht-receivable',
    };

    beforeEach(() => {
      accountingSettings.get.mockResolvedValue(makeAccountingSettings(taxSettings));
      currencyConversion.convert.mockImplementation(async (_db, amount: Money) => ({
        convertedAmount: amount,
        rateUsed: '1',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      }));
    });

    it('a sales invoice splits revenue, output VAT, table tax and the withholding the customer keeps', async () => {
      // net 1,000 + table 80 + VAT 151.20 − WHT 10 = 1,221.20 owed by the customer
      await listeners.handleSalesInvoicePosted(
        makePayload({
          totalAmount: egp('122120'),
          netAmount: egp('100000'),
          tableTaxAmount: egp('8000'),
          vatAmount: egp('15120'),
          withholdingAmount: egp('1000'),
          invoiceDate: '2026-09-10',
        }),
      );
      const entry = journalEntries.createAuto.mock.calls[0]![1];
      expect(entry.entryDate).toBe('2026-09-10');
      expect(entry.lines).toEqual([
        { accountId: 'ar-account', debitAmountMinorUnits: '122120', creditAmountMinorUnits: '0' },
        { accountId: 'wht-receivable', debitAmountMinorUnits: '1000', creditAmountMinorUnits: '0' },
        { accountId: 'vat-out', debitAmountMinorUnits: '0', creditAmountMinorUnits: '15120' },
        { accountId: 'table-out', debitAmountMinorUnits: '0', creditAmountMinorUnits: '8000' },
        { accountId: 'revenue-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '100000' },
      ]);
    });

    it('a purchase invoice clears GRNI at the net, takes input VAT and withholds tax from the supplier', async () => {
      (stockItemVariantIds as jest.Mock).mockResolvedValue(new Set(['stock-variant']));
      // stock 800 + service 200 = net 1,000; VAT 140; WHT 1% = 10 → owed 1,130
      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            totalAmount: egp('113000'),
            netAmount: egp('100000'),
            tableTaxAmount: egp('0'),
            vatAmount: egp('14000'),
            withholdingAmount: egp('1000'),
            lines: [
              { productVariantId: 'stock-variant', quantity: 8, unitPrice: egp('10000'), netAmount: egp('80000') },
              { productVariantId: 'service-variant', quantity: 1, unitPrice: egp('20000'), netAmount: egp('20000') },
            ],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-3' },
        ),
      );
      expect(journalEntries.createAuto.mock.calls[0]![1].lines).toEqual([
        { accountId: 'grni-account', debitAmountMinorUnits: '80000', creditAmountMinorUnits: '0' },
        { accountId: 'expense-account', debitAmountMinorUnits: '20000', creditAmountMinorUnits: '0' },
        { accountId: 'vat-in', debitAmountMinorUnits: '14000', creditAmountMinorUnits: '0' },
        { accountId: 'wht-payable', debitAmountMinorUnits: '0', creditAmountMinorUnits: '1000' },
        { accountId: 'ap-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '113000' },
      ]);
    });

    it('fails loudly when a tax mapping is missing', async () => {
      accountingSettings.get.mockResolvedValue(makeAccountingSettings({ ...taxSettings, vatOutputAccountId: null }));
      await expect(
        listeners.handleSalesInvoicePosted(
          makePayload({ totalAmount: egp('11400'), netAmount: egp('10000'), vatAmount: egp('1400') }),
        ),
      ).rejects.toMatchObject({ code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING' });
    });
  });

  describe('handlePurchaseInvoicePosted', () => {
    it('converts a foreign-currency purchase invoice before posting the expense/payable lines', async () => {
      currencyConversion.convert.mockResolvedValue({
        convertedAmount: { toMinorUnits: () => 250000n } as unknown as Money,
        rateUsed: '25.0',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      });

      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          { totalAmount: { amountMinorUnits: '10000', currency: 'EUR' } },
          { entityType: 'purchase_invoice', entityId: 'invoice-2' },
        ),
      );

      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'expense-account', debitAmountMinorUnits: '250000' }),
            expect.objectContaining({ accountId: 'ap-account', creditAmountMinorUnits: '250000' }),
          ],
          description: 'فاتورة شراء invoice-2 (EUR → EGP)',
        }),
      );
    });
  });

  describe('handlePurchaseDebitNoteIssued', () => {
    it('posts the exact reverse of a purchase invoice (Dr payables / Cr expense)', async () => {
      currencyConversion.convert.mockImplementation(async (_db, amount) => ({
        convertedAmount: amount,
        rateUsed: '1',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      }));

      await listeners.handlePurchaseDebitNoteIssued(
        makePayload(
          { totalAmount: { amountMinorUnits: '30000', currency: 'EGP' } },
          { entityType: 'purchase_debit_note', entityId: 'debit-note-1' },
        ),
      );

      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'expense-account', creditAmountMinorUnits: '30000' }),
            expect.objectContaining({ accountId: 'ap-account', debitAmountMinorUnits: '30000' }),
          ],
          sourceReferenceType: 'purchase_debit_note',
        }),
      );
    });
  });

  describe('handlePurchaseInvoicePosted — perpetual inventory (inventory step 4)', () => {
    it('clears goods-received-not-invoiced for stock lines and expenses only the service lines', async () => {
      (stockItemVariantIds as jest.Mock).mockResolvedValue(new Set(['stock-variant']));
      currencyConversion.convert.mockImplementation(async (_db, amount) => ({
        convertedAmount: amount,
        rateUsed: '1',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      }));

      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            totalAmount: { amountMinorUnits: '130000', currency: 'EGP' },
            lines: [
              { productVariantId: 'stock-variant', quantity: 10, unitPrice: { amountMinorUnits: '10000', currency: 'EGP' } },
              { productVariantId: 'service-variant', quantity: 1, unitPrice: { amountMinorUnits: '30000', currency: 'EGP' } },
            ],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-3' },
        ),
      );

      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            { accountId: 'grni-account', debitAmountMinorUnits: '100000', creditAmountMinorUnits: '0' },
            { accountId: 'expense-account', debitAmountMinorUnits: '30000', creditAmountMinorUnits: '0' },
            { accountId: 'ap-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '130000' },
          ],
        }),
      );
    });

    it('does not need a purchase expense account when every line is a stock item', async () => {
      (stockItemVariantIds as jest.Mock).mockResolvedValue(new Set(['stock-variant']));
      accountingSettings.get.mockResolvedValue(makeAccountingSettings({ purchaseExpenseAccountId: null }));
      currencyConversion.convert.mockImplementation(async (_db, amount) => ({
        convertedAmount: amount,
        rateUsed: '1',
        rateDate: '2026-09-13',
        rateSource: 'manual',
      }));

      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            totalAmount: { amountMinorUnits: '50000', currency: 'EGP' },
            lines: [{ productVariantId: 'stock-variant', quantity: 5, unitPrice: { amountMinorUnits: '10000', currency: 'EGP' } }],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-4' },
        ),
      );

      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            { accountId: 'grni-account', debitAmountMinorUnits: '50000', creditAmountMinorUnits: '0' },
            { accountId: 'ap-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '50000' },
          ],
        }),
      );
    });
  });

  describe('handleSalesCreditNoteIssued', () => {
    it('converts a credit note issued against a foreign-currency invoice', async () => {
      currencyConversion.convert.mockResolvedValue({
        convertedAmount: { toMinorUnits: () => 51341n } as unknown as Money,
        rateUsed: '51.341',
        rateDate: '2026-09-13',
        rateSource: 'api',
      });

      await listeners.handleSalesCreditNoteIssued(
        makePayload(
          {
            salesReturnId: 'return-1',
            customerId: 'customer-1',
            currency: 'USD',
            totalAmount: { amountMinorUnits: '1000', currency: 'USD' },
          },
          { entityType: 'sales_credit_note', entityId: 'credit-note-1' },
        ),
      );

      expect(journalEntries.createAuto).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'contra-account', debitAmountMinorUnits: '51341' }),
            expect.objectContaining({ accountId: 'ar-account', creditAmountMinorUnits: '51341' }),
          ],
          description: 'إشعار دائن — مرتجع مبيعات return-1 (USD → EGP)',
        }),
      );
    });
  });

  describe('purchase documents — exchange differences (IAS 21) and GRNI', () => {
    const egp = (amount: bigint | number) => ({ amountMinorUnits: String(amount), currency: 'EGP' });
    const usd = (amount: bigint | number) => ({ amountMinorUnits: String(amount), currency: 'USD' });
    /** USD→EGP at `rates[date]` (exact BigInt, as CurrencyConversionService does). */
    const convertAt = (rates: Record<string, string>) =>
      currencyConversion.convert.mockImplementation(async (_db, amount: Money, _to: string, date: string) => ({
        convertedAmount:
          amount.currency === 'EGP' ? amount : MoneyVO.fromMinorUnits(applyRate(amount.toMinorUnits(), rates[date]!), 'EGP'),
        rateUsed: amount.currency === 'EGP' ? '1' : rates[date]!,
        rateDate: date,
        rateSource: 'manual',
      }));

    beforeEach(() => {
      (stockItemVariantIds as jest.Mock).mockResolvedValue(new Set(['stock-variant']));
      accountingSettings.get.mockResolvedValue(makeAccountingSettings({ exchangeGainLossAccountId: 'fx-account' }));
    });

    it('foreign invoice with a price difference and a rate movement: GRNI at receipt value + price part, FX on its own line', async () => {
      // Received 10 × 10 USD at 48 → GRNI Cr 4,800. Invoiced 10 × 11 USD = 110 USD at 50 → AP 5,500.
      // Price part 10 USD × 50 = 500 (Inventory: Dr stock / Cr GRNI); FX part 100 USD × 2 = 200.
      convertAt({ '2026-11-01': '50' });
      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            invoiceNumber: 'PI-7',
            invoiceDate: '2026-11-01',
            totalAmount: usd(11_000),
            netAmount: usd(11_000),
            lines: [
              { productVariantId: 'stock-variant', quantity: 10, unitPrice: usd(1_100), netAmount: usd(11_000), ledgerNetAmount: egp(550_000) },
            ],
            priceDifferences: [
              {
                purchaseOrderLineId: 'pol1',
                productVariantId: 'stock-variant',
                matchedBaseQuantity: 10,
                goodsReceiptIds: ['gr1'],
                receivedValue: egp(480_000),
                invoicedValue: egp(550_000),
                amount: egp(50_000),
                exchangeDifference: egp(20_000),
              },
            ],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-7' },
        ),
      );
      const entry = journalEntries.createAuto.mock.calls[0]![1];
      expect(entry.lines).toEqual([
        { accountId: 'grni-account', debitAmountMinorUnits: '530000', creditAmountMinorUnits: '0' },
        {
          accountId: 'fx-account',
          debitAmountMinorUnits: '20000',
          creditAmountMinorUnits: '0',
          description: 'فرق عملة — فاتورة شراء PI-7',
        },
        { accountId: 'ap-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '550000' },
      ]);
      // GRNI: −4,800 (receipt) + 5,300 (invoice) − 500 (price difference) = 0.
      expect(-480_000 + 530_000 - 50_000).toBe(0);
    });

    it('a tenant-currency invoice is unchanged: GRNI at the full net, no exchange line', async () => {
      convertAt({});
      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            invoiceDate: '2026-11-01',
            totalAmount: egp(110_000),
            netAmount: egp(110_000),
            lines: [{ productVariantId: 'stock-variant', quantity: 10, unitPrice: egp(11_000), netAmount: egp(110_000), ledgerNetAmount: egp(110_000) }],
            priceDifferences: [
              {
                purchaseOrderLineId: 'pol1',
                productVariantId: 'stock-variant',
                matchedBaseQuantity: 10,
                goodsReceiptIds: ['gr1'],
                receivedValue: egp(100_000),
                invoicedValue: egp(110_000),
                amount: egp(10_000),
                exchangeDifference: egp(0),
              },
            ],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-8' },
        ),
      );
      expect(journalEntries.createAuto.mock.calls[0]![1].lines).toEqual([
        { accountId: 'grni-account', debitAmountMinorUnits: '110000', creditAmountMinorUnits: '0' },
        { accountId: 'ap-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '110000' },
      ]);
    });

    it('awkward rates: GRNI is the per-line ledger values exactly; the one-total rounding remainder goes to FX', async () => {
      // Three stock lines of 33.33 USD at 47.3359: per line 1,577.71 (×3 = 4,733.13), as one total 4,733.12.
      const rate = '47.3359';
      convertAt({ '2026-11-01': rate });
      const perLine = applyRate(3_333n, rate);
      expect(perLine * 3n).not.toBe(applyRate(9_999n, rate));
      await listeners.handlePurchaseInvoicePosted(
        makePayload(
          {
            invoiceDate: '2026-11-01',
            totalAmount: usd(9_999),
            netAmount: usd(9_999),
            lines: [1, 2, 3].map(() => ({
              productVariantId: 'stock-variant',
              quantity: 1,
              unitPrice: usd(3_333),
              netAmount: usd(3_333),
              ledgerNetAmount: egp(perLine),
            })),
            priceDifferences: [],
          },
          { entityType: 'purchase_invoice', entityId: 'invoice-9' },
        ),
      );
      const lines = journalEntries.createAuto.mock.calls[0]![1].lines;
      expect(lines[0]).toEqual({ accountId: 'grni-account', debitAmountMinorUnits: String(perLine * 3n), creditAmountMinorUnits: '0' });
      // The 0.01 remainder (one total − per-line sum = −1) is a credit on the exchange line.
      expect(lines[1]).toMatchObject({ accountId: 'fx-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '1' });
      const debit = lines.reduce((sum, l) => sum + BigInt(l.debitAmountMinorUnits), 0n);
      const credit = lines.reduce((sum, l) => sum + BigInt(l.creditAmountMinorUnits), 0n);
      expect(debit).toBe(credit);
    });

    it('fails loudly (outbox retries) when an exchange difference has no gain/loss account', async () => {
      accountingSettings.get.mockResolvedValue(makeAccountingSettings({ exchangeGainLossAccountId: null }));
      convertAt({ '2026-11-01': '50' });
      await expect(
        listeners.handlePurchaseInvoicePosted(
          makePayload(
            {
              invoiceDate: '2026-11-01',
              totalAmount: usd(10_000),
              netAmount: usd(10_000),
              lines: [{ productVariantId: 'stock-variant', quantity: 1, unitPrice: usd(10_000), netAmount: usd(10_000), ledgerNetAmount: egp(500_000) }],
              priceDifferences: [
                {
                  purchaseOrderLineId: 'pol1',
                  productVariantId: 'stock-variant',
                  matchedBaseQuantity: 1,
                  goodsReceiptIds: ['gr1'],
                  receivedValue: egp(480_000),
                  invoicedValue: egp(500_000),
                  amount: egp(0),
                  exchangeDifference: egp(20_000),
                },
              ],
            },
            { entityType: 'purchase_invoice', entityId: 'invoice-10' },
          ),
        ),
      ).rejects.toMatchObject({ code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING' });
      expect(journalEntries.createAuto).not.toHaveBeenCalled();
    });

    it('a foreign debit note is converted at its source invoice rate, dated on the note', async () => {
      // Invoice 2026-11-01 at 50; the note is dated 2026-11-05 when the rate is 52.
      convertAt({ '2026-11-01': '50', '2026-11-05': '52' });
      await listeners.handlePurchaseDebitNoteIssued(
        makePayload(
          {
            invoiceNumber: 'DN-1',
            invoiceDate: '2026-11-05',
            sourceInvoiceDate: '2026-11-01',
            totalAmount: usd(2_200),
            netAmount: usd(2_200),
            lines: [{ productVariantId: 'stock-variant', quantity: 2, netAmount: usd(2_200), sourceInvoiceDate: '2026-11-01' }],
          },
          { entityType: 'purchase_debit_note', entityId: 'debit-note-2' },
        ),
      );
      const entry = journalEntries.createAuto.mock.calls[0]![1];
      expect(entry.entryDate).toBe('2026-11-05');
      expect(entry.lines).toEqual([
        { accountId: 'grni-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '110000' },
        { accountId: 'ap-account', debitAmountMinorUnits: '110000', creditAmountMinorUnits: '0' },
      ]);
    });

    it('receipt after invoice: books the exchange part Dr gain/loss / Cr GRNI (stock lines only)', async () => {
      (stockItemVariantIds as jest.Mock).mockResolvedValue(new Set(['stock-variant']));
      const difference = (variant: string, fx: number) => ({
        purchaseOrderLineId: 'pol1',
        productVariantId: variant,
        matchedBaseQuantity: 10,
        goodsReceiptIds: ['gr1'],
        purchaseInvoiceId: 'inv1',
        invoiceNumber: 'PI-1',
        invoiceDate: '2026-11-01',
        invoiceUnitPrice: usd(1_100),
        receivedValue: egp(480_000),
        invoicedValue: egp(550_000),
        amount: egp(50_000),
        exchangeDifference: egp(fx),
      });
      await listeners.handleGoodsReceiptConfirmed(
        makePayload(
          {
            receiptNumber: 'GR-3',
            receivedDate: '2026-11-04',
            invoicedDifferences: [difference('stock-variant', 20_000), difference('service-variant', 999)],
          },
          { entityType: 'goods_receipt', entityId: 'receipt-3', action: 'confirmed' },
        ),
      );
      expect(journalEntries.createAuto).toHaveBeenCalledWith(FAKE_DB, {
        entryDate: '2026-11-04',
        description: 'فرق عملة — إذن استلام GR-3 (فاتورة شراء PI-1)',
        lines: [
          { accountId: 'fx-account', debitAmountMinorUnits: '20000', creditAmountMinorUnits: '0' },
          { accountId: 'grni-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '20000' },
        ],
        sourceReferenceType: 'goods_receipt_exchange_difference',
        sourceReferenceId: 'receipt-3',
      });
    });

    it('an ordinary receipt (nothing invoiced ahead of it) posts nothing here', async () => {
      await listeners.handleGoodsReceiptConfirmed(
        makePayload({ receiptNumber: 'GR-4', lines: [] }, { entityType: 'goods_receipt', entityId: 'receipt-4' }),
      );
      expect(journalEntries.createAuto).not.toHaveBeenCalled();
    });
  });
});
