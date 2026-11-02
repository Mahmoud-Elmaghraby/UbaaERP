import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockMovementRepository } from '../ports/stock-movement.repository';
import type { StockLevelRepository } from '../ports/stock-level.repository';
import type { StockLevel } from '../../domain/stock-level.entity';
import type { StockMovementsService } from './stock-movements.service';
import type { InventoryValuationEventsService } from './inventory-valuation-events.service';
import { PurchaseCostCorrectionsService } from './purchase-cost-corrections.service';

const egp = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'EGP');

/** 10 received at 100 into one location; `onHand` of them are left. */
function setup(onHand: number, value: number) {
  const level: StockLevel = {
    id: 'sl1',
    productVariantId: 'v1',
    locationId: 'loc1',
    warehouseId: 'wh1',
    quantityOnHand: onHand,
    reorderPoint: null,
    averageCost: onHand > 0 ? egp(value).divideByQuantity(onHand) : egp(0),
    inventoryValue: egp(value),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const upserts: Array<{ inventoryValue: Money; averageCost: Money }> = [];
  const movements = {
    quantityByLocationForReferences: jest.fn().mockResolvedValue([{ locationId: 'loc1', warehouseId: 'wh1', quantity: 10 }]),
    sumForReference: jest.fn(),
  } as unknown as StockMovementRepository;
  const stockLevels = {
    lockVariants: jest.fn(),
    findByVariantAndLocation: jest.fn().mockResolvedValue(level),
    upsert: jest.fn(async (_db: unknown, input: { inventoryValue: Money; averageCost: Money }) => {
      upserts.push(input);
      return level;
    }),
  } as unknown as StockLevelRepository;
  const stockMovements = { stockItemVariantIds: jest.fn().mockResolvedValue(new Set(['v1'])) } as unknown as StockMovementsService;
  const written: Array<{ entries: Array<{ kind: string; amount: Money }> }> = [];
  const valuationEvents = {
    write: jest.fn(async (_db: unknown, input: { entries: Array<{ kind: string; amount: Money }> }) => {
      written.push(input);
      return true;
    }),
  } as unknown as InventoryValuationEventsService;
  const service = new PurchaseCostCorrectionsService(movements, stockLevels, stockMovements, valuationEvents);
  jest
    .spyOn(service as unknown as { alreadyApplied: () => Promise<boolean> }, 'alreadyApplied')
    .mockResolvedValue(false);
  return { service, upserts, written, movements };
}

const trx = {} as Kysely<TenantDatabase>;
const difference = (amountMinor: number) => ({
  purchaseOrderLineId: 'pol1',
  productVariantId: 'v1',
  matchedBaseQuantity: 10,
  goodsReceiptIds: ['gr1'],
  receivedValue: { amountMinorUnits: '100000', currency: 'EGP' },
  invoicedValue: { amountMinorUnits: String(100000 + amountMinor), currency: 'EGP' },
  amount: { amountMinorUnits: String(amountMinor), currency: 'EGP' },
});
const invoice = (amountMinor: number) => ({
  schema: 't',
  actorUserId: null,
  invoiceId: 'inv1',
  invoiceNumber: 'PI-1',
  entryDate: '2026-11-02',
  differences: [difference(amountMinor)],
});

describe('PurchaseCostCorrectionsService.applyInvoiceDifferences', () => {
  it('splits a +10/unit difference: 6 on hand → stock, 4 sold → COGS; average cost becomes 110', async () => {
    const { service, upserts, written } = setup(6, 60_000);
    await service.applyInvoiceDifferences(trx, invoice(10_000));
    expect(upserts[0].inventoryValue.toMinorUnits()).toBe(66_000n);
    expect(upserts[0].averageCost.toMinorUnits()).toBe(11_000n);
    const entries = Object.fromEntries(written[0].entries.map((e) => [e.kind, e.amount.toMinorUnits()]));
    expect(entries).toEqual({ price_difference_inventory: 6_000n, price_difference_cogs: 4_000n });
  });

  it('all still on hand → all to stock', async () => {
    const { service, written } = setup(10, 100_000);
    await service.applyInvoiceDifferences(trx, invoice(10_000));
    const entries = Object.fromEntries(written[0].entries.map((e) => [e.kind, e.amount.toMinorUnits()]));
    expect(entries).toEqual({ price_difference_inventory: 10_000n, price_difference_cogs: 0n });
  });

  it('a cheaper invoice lowers the stock value, never below zero', async () => {
    const { service, upserts, written } = setup(10, 5_000);
    await service.applyInvoiceDifferences(trx, invoice(-10_000));
    expect(upserts[0].inventoryValue.toMinorUnits()).toBe(0n);
    const entries = Object.fromEntries(written[0].entries.map((e) => [e.kind, e.amount.toMinorUnits()]));
    expect(entries).toEqual({ price_difference_inventory: -5_000n, price_difference_cogs: -5_000n });
  });

  it('everything sold → all to COGS, stock untouched', async () => {
    const { service, upserts, written } = setup(0, 0);
    await service.applyInvoiceDifferences(trx, invoice(10_000));
    expect(upserts).toEqual([]);
    const entries = Object.fromEntries(written[0].entries.map((e) => [e.kind, e.amount.toMinorUnits()]));
    expect(entries).toEqual({ price_difference_inventory: 0n, price_difference_cogs: 10_000n });
  });
});

describe('PurchaseCostCorrectionsService.applyReturnDifference', () => {
  const input = {
    schema: 't',
    actorUserId: null,
    debitNoteId: 'dn1',
    debitNoteNumber: 'DN-1',
    purchaseReturnId: 'pr1',
    entryDate: '2026-11-02',
    lines: [{ productVariantId: 'v1', baseQuantity: 2, value: egp(22_000) }],
  };

  it('debit note 220 for goods that left at 200 → 20 clears GRNI against COGS', async () => {
    const { service, movements, written } = setup(5, 50_000);
    (movements.sumForReference as jest.Mock).mockResolvedValue({ quantity: 2, totalCostMinorUnits: 20_000n, currency: 'EGP' });
    await service.applyReturnDifference(trx, input);
    expect(written[0].entries).toEqual([{ kind: 'return_price_difference', amount: egp(2_000) }]);
  });

  it('waits (throws) until the return is in stock movements', async () => {
    const { service, movements } = setup(5, 50_000);
    (movements.sumForReference as jest.Mock).mockResolvedValue(null);
    await expect(service.applyReturnDifference(trx, input)).rejects.toThrow(/no stock movements yet/);
  });
});
