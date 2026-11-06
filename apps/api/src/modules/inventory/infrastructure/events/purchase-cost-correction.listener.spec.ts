import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { PurchaseCostCorrectionsService } from '../../application/services/purchase-cost-corrections.service';
import { PurchaseCostCorrectionListener } from './purchase-cost-correction.listener';

const DB = { isTransaction: true } as unknown as Kysely<TenantDatabase>;
const egp = (minor: number) => ({ amountMinorUnits: String(minor), currency: 'EGP' });
const usd = (minor: number) => ({ amountMinorUnits: String(minor), currency: 'USD' });

function setup(rates: Record<string, string | null>) {
  const corrections = {
    applyInvoiceDifferences: jest.fn(),
    applyReturnDifference: jest.fn(),
  } as unknown as jest.Mocked<PurchaseCostCorrectionsService>;
  const connections = { getClient: jest.fn().mockReturnValue(DB) } as unknown as TenantConnectionManager;
  const listener = new PurchaseCostCorrectionListener(connections, corrections);
  const effectiveRate = jest.fn(async (_db: unknown, _from: string, _to: string, date: string) => rates[date] ?? null);
  Object.assign(listener as unknown as Record<string, unknown>, {
    currencyRates: { tenantCurrency: jest.fn().mockResolvedValue('EGP'), effectiveRate },
  });
  return { listener, corrections, effectiveRate };
}

const payload = (metadata: Record<string, unknown>, entityId = 'doc-1'): DomainEventPayload => ({
  schema: 't',
  entityType: 'x',
  entityId,
  action: 'posted',
  actorUserId: null,
  metadata,
  occurredAt: new Date('2026-11-05T10:00:00Z'),
});

describe('PurchaseCostCorrectionListener', () => {
  it('invoice: hands Inventory only the price parts — an FX-only difference is not stock cost', async () => {
    const { listener, corrections } = setup({});
    const difference = (variant: string, price: number, fx: number) => ({
      purchaseOrderLineId: 'pol-' + variant,
      productVariantId: variant,
      matchedBaseQuantity: 1,
      goodsReceiptIds: ['gr1'],
      receivedValue: egp(48_000),
      invoicedValue: egp(48_000 + price + fx),
      amount: egp(price),
      exchangeDifference: egp(fx),
    });
    await listener.handleInvoice(
      payload({ invoiceNumber: 'PI-1', invoiceDate: '2026-11-01', priceDifferences: [difference('a', 5_000, 2_000), difference('b', 0, 2_000)] }),
    );
    const input = corrections.applyInvoiceDifferences.mock.calls[0][1];
    expect(input.differences.map((d) => [d.productVariantId, d.amount.amountMinorUnits])).toEqual([['a', '5000']]);

    corrections.applyInvoiceDifferences.mockClear();
    await listener.handleInvoice(payload({ priceDifferences: [difference('b', 0, 2_000)] }));
    expect(corrections.applyInvoiceDifferences).not.toHaveBeenCalled();
  });

  it('debit note: values each line at its source invoice rate, not the note date', async () => {
    const { listener, corrections, effectiveRate } = setup({ '2026-11-01': '50', '2026-11-05': '52' });
    await listener.handleDebitNote(
      payload({
        purchaseReturnId: 'ret-1',
        invoiceNumber: 'DN-1',
        invoiceDate: '2026-11-05',
        sourceInvoiceDate: '2026-11-01',
        lines: [{ productVariantId: 'v1', quantity: 2, netAmount: usd(2_200), sourceInvoiceDate: '2026-11-01' }],
      }),
    );
    expect(effectiveRate).toHaveBeenCalledWith(DB, 'USD', 'EGP', '2026-11-01');
    const input = corrections.applyReturnDifference.mock.calls[0][1];
    expect(input.entryDate).toBe('2026-11-05');
    expect((input.lines[0].value as Money).toMinorUnits()).toBe(110_000n);
  });

  it('debit note with no rate on the source invoice date throws (outbox retries) instead of skipping', async () => {
    const { listener, corrections } = setup({});
    await expect(
      listener.handleDebitNote(
        payload({
          purchaseReturnId: 'ret-1',
          invoiceDate: '2026-11-05',
          sourceInvoiceDate: '2026-11-01',
          lines: [{ productVariantId: 'v1', quantity: 2, netAmount: usd(2_200) }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'EXCHANGE_RATE.NOT_AVAILABLE', params: { from: 'USD', to: 'EGP', date: '2026-11-01' } });
    expect(corrections.applyReturnDifference).not.toHaveBeenCalled();
  });
});
