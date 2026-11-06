import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { StockMovementsService } from '../../application/services/stock-movements.service';
import type { WarehouseLocationRepository } from '../../application/ports/warehouse-location.repository';
import type { InventoryValuationEventsService } from '../../application/services/inventory-valuation-events.service';
import type { PurchaseCostCorrectionsService } from '../../application/services/purchase-cost-corrections.service';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import { PurchaseReturnStockListener } from './purchase-return-stock.listener';
import { GoodsReceiptStockListener } from './goods-receipt-stock.listener';

const DB = { isTransaction: true } as unknown as Kysely<TenantDatabase>;
const egp = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'EGP');

function deps(movementCost: (quantity: number) => Money) {
  const stockMovements = {
    lockVariants: jest.fn(),
    hasMovementsForReference: jest.fn().mockResolvedValue(false),
    stockItemVariantIds: jest.fn().mockResolvedValue(new Set(['v1'])),
    lotsMovedByReference: jest.fn().mockResolvedValue([]),
    planOutgoingLots: jest.fn().mockResolvedValue(null),
    trackingTypeOf: jest.fn().mockResolvedValue('none'),
    recordMovement: jest.fn(async (_db: unknown, input: { quantity: number; totalCost?: Money }) => ({
      totalCost: input.totalCost ?? movementCost(input.quantity),
    })),
  } as unknown as StockMovementsService;
  const locations = {
    listByWarehouseId: jest.fn().mockResolvedValue([{ id: 'loc1', code: DEFAULT_LOCATION_CODE }]),
  } as unknown as WarehouseLocationRepository;
  const connections = { getClient: jest.fn().mockReturnValue(DB) } as unknown as TenantConnectionManager;
  const written: Array<{ entries: Array<{ kind: string; amount: Money }> }> = [];
  const valuationEvents = {
    write: jest.fn(async (_db: unknown, input: { entries: Array<{ kind: string; amount: Money }> }) => {
      written.push(input);
      return true;
    }),
  } as unknown as InventoryValuationEventsService;
  return { stockMovements, locations, connections, valuationEvents, written };
}

const payload = (metadata: Record<string, unknown>, entityId: string): DomainEventPayload => ({
  schema: 't',
  entityType: 'x',
  entityId,
  action: 'confirmed',
  actorUserId: null,
  metadata,
  occurredAt: new Date('2026-11-05T10:00:00Z'),
});

const entriesOf = (written: Array<{ entries: Array<{ kind: string; amount: Money }> }>) =>
  // InventoryValuationEventsService drops zero entries; mirror that here.
  Object.fromEntries(
    written[0].entries.filter((entry) => !entry.amount.isZero()).map((entry) => [entry.kind, entry.amount.toMinorUnits()]),
  );

describe('PurchaseReturnStockListener — return before invoicing', () => {
  it('takes the never-invoiced part out of GRNI at the receipt value; avg-cost gap → COGS', async () => {
    // 4 returned at the current average 95/unit (380). 3 of them were never invoiced and
    // were received at 100/unit (300): Dr GRNI 380 + 15, Cr Inventory 380, Cr COGS 15.
    const d = deps((quantity) => egp(9_500 * quantity));
    const listener = new PurchaseReturnStockListener(d.stockMovements, d.locations, d.connections, d.valuationEvents);
    await listener.handle(
      payload(
        {
          goodsReceiptId: 'gr1',
          warehouseId: 'wh1',
          returnNumber: 'PR-1',
          lines: [{ productVariantId: 'v1', quantity: 4, uninvoicedBaseQuantity: 3, uninvoicedReceiptValue: { amountMinorUnits: '30000', currency: 'EGP' } }],
        },
        'ret-1',
      ),
    );
    expect(entriesOf(d.written)).toEqual({ purchase_return: 38_000n, return_price_difference: 1_500n });
  });

  it('an entirely invoiced return (or an older event) keeps the plain reversal', async () => {
    const d = deps((quantity) => egp(9_500 * quantity));
    const listener = new PurchaseReturnStockListener(d.stockMovements, d.locations, d.connections, d.valuationEvents);
    await listener.handle(payload({ goodsReceiptId: 'gr1', warehouseId: 'wh1', lines: [{ productVariantId: 'v1', quantity: 4 }] }, 'ret-2'));
    expect(d.written[0].entries.map((entry) => entry.kind)).toEqual(['purchase_return']);
  });
});

describe('GoodsReceiptStockListener — receipt after invoice', () => {
  it('adds the invoice price part to the stock just received (Dr Inventory / Cr GRNI), not the FX part', async () => {
    const d = deps(() => egp(0));
    const costCorrections = {
      applyReceiptDifferences: jest.fn().mockResolvedValue({ toInventory: egp(50_000), toCogs: egp(0) }),
    } as unknown as jest.Mocked<PurchaseCostCorrectionsService>;
    const listener = new GoodsReceiptStockListener(d.stockMovements, d.locations, d.connections, d.valuationEvents, costCorrections);
    const invoicedDifferences = [
      {
        purchaseOrderLineId: 'pol1',
        productVariantId: 'v1',
        matchedBaseQuantity: 10,
        goodsReceiptIds: ['gr1'],
        receivedValue: { amountMinorUnits: '480000', currency: 'EGP' },
        invoicedValue: { amountMinorUnits: '550000', currency: 'EGP' },
        amount: { amountMinorUnits: '50000', currency: 'EGP' },
        exchangeDifference: { amountMinorUnits: '20000', currency: 'EGP' },
      },
    ];
    await listener.handle(
      payload(
        {
          purchaseOrderId: 'po1',
          warehouseId: 'wh1',
          receiptNumber: 'GR-1',
          lines: [
            {
              productVariantId: 'v1',
              quantity: 10,
              unitCost: { amountMinorUnits: '48000', currency: 'EGP' },
              totalCost: { amountMinorUnits: '480000', currency: 'EGP' },
            },
          ],
          invoicedDifferences,
        },
        'gr1',
      ),
    );
    expect(costCorrections.applyReceiptDifferences).toHaveBeenCalledWith(DB, invoicedDifferences);
    // Receipt 4,800 + price part 500 = 5,300 out of GRNI; the 200 FX part is Accounting's.
    expect(entriesOf(d.written)).toEqual({ receipt: 480_000n, price_difference_inventory: 50_000n });
  });
});
