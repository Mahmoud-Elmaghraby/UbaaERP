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
          description: 'Sales invoice revenue — invoice invoice-1',
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
          description: 'Sales invoice revenue — invoice invoice-1 (USD converted to EGP)',
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
          description: 'Purchase invoice — invoice invoice-2 (EUR converted to EGP)',
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
          description: 'Sales credit note revenue reversal — sales return return-1 (USD converted to EGP)',
        }),
      );
    });
  });
});
