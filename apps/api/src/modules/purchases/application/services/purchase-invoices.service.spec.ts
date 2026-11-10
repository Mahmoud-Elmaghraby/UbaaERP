import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import type { PurchaseInvoice, PurchaseInvoiceLine } from '../../domain/purchase-invoice.entity';

jest.mock('../../../../shared/persistence/row-locks', () => ({ lockRowsForUpdate: jest.fn() }));
// Pulls in Prisma (not generated in unit runs); post() never uses it.
jest.mock('../../../../shared/plans/feature-availability.service', () => ({ FeatureAvailabilityService: class {} }));

const usd = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'USD');

/** PurchaseInvoicesService.post() with everything but the rate lookup stubbed: one USD line, PO confirmed. */
function setup(rate: string | null) {
  const draft: PurchaseInvoice = {
    id: 'inv1',
    invoiceNumber: 'PI-1',
    supplierInvoiceNumber: null,
    purchaseOrderId: 'po1',
    status: 'draft',
    invoiceDate: '2026-11-01',
    dueDate: null,
    notes: null,
    customFields: {},
    pricesIncludeTax: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const line: PurchaseInvoiceLine = {
    id: 'l1',
    purchaseInvoiceId: 'inv1',
    purchaseOrderLineId: 'pol1',
    productVariantId: 'v1',
    quantityInvoiced: 1,
    unitPrice: usd(10_000),
    netAmount: usd(10_000),
    taxes: [],
    notes: null,
    createdAt: new Date(),
    unitOfMeasureId: null,
    unitFactor: 1,
  };
  const invoices = {
    findById: jest.fn().mockResolvedValue(draft),
    updateStatus: jest.fn().mockResolvedValue({ ...draft, status: 'posted' }),
  };
  const lines = {
    listByPurchaseInvoiceId: jest.fn().mockResolvedValue([line]),
    sumInvoicedBaseQuantityByPurchaseOrderLineIds: jest.fn().mockResolvedValue({}),
  };
  const orders = { findById: jest.fn().mockResolvedValue({ id: 'po1', status: 'confirmed' }) };
  const orderLines = {
    listByPurchaseOrderId: jest.fn().mockResolvedValue([{ id: 'pol1', quantity: 1, unitFactor: 1 }]),
  };
  const goodsReceipts = {
    listMadeByInvoice: jest.fn().mockResolvedValue([]),
    receivedValueByOrderLine: jest.fn().mockResolvedValue(new Map()),
  };
  const outbox = { write: jest.fn() };
  const service = new PurchaseInvoicesService(
    invoices as never,
    lines as never,
    orders as never,
    orderLines as never,
    {} as never,
    {} as never,
    {} as never,
    outbox as never,
    {} as never,
    {} as never,
    goodsReceipts as never,
    { orderedLimit: jest.fn().mockResolvedValue((n: number) => n), assert: jest.fn(), check: jest.fn() } as never,
    { get: jest.fn().mockResolvedValue(false) } as never,
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    currencyRates: {
      tenantCurrency: jest.fn().mockResolvedValue('EGP'),
      effectiveRate: jest.fn().mockResolvedValue(rate),
    },
  });
  const trx = { isTransaction: true } as unknown as Kysely<TenantDatabase>;
  return { service, trx, outbox };
}

describe('PurchaseInvoicesService.post — exchange rate on the invoice date', () => {
  it('refuses to post a foreign-currency invoice with no rate on its date (nothing reaches the outbox)', async () => {
    const { service, trx, outbox } = setup(null);
    await expect(service.post(trx, 'inv1', 't', null)).rejects.toMatchObject({
      code: 'PURCHASE_INVOICE.EXCHANGE_RATE_MISSING',
      params: { currency: 'USD', tenantCurrency: 'EGP', date: '2026-11-01' },
    });
    expect(outbox.write).not.toHaveBeenCalled();
  });

  it('with a rate: each line carries its net at the invoice rate, and the rate itself', async () => {
    const { service, trx, outbox } = setup('49.1177');
    await service.post(trx, 'inv1', 't', null);
    const metadata = outbox.write.mock.calls[0][2].metadata;
    expect(metadata.exchangeRate).toBe('49.1177');
    expect(metadata.lines[0].ledgerNetAmount).toEqual({ amountMinorUnits: '491177', currency: 'EGP' });
    expect(metadata.priceDifferences).toEqual([]);
  });
});
