import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { STOCK_COUNT_REPOSITORY, type StockCountRepository } from '../ports/stock-count.repository';
import { STOCK_LOT_REPOSITORY, type StockLotRepository } from '../ports/stock-lot.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../ports/warehouse-location.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import type {
  CreateStockCountInput,
  StockCount,
  StockCountKind,
  StockCountLine,
  StockCountPostingLine,
  StockCountWithLines,
  UpsertStockCountLineInput,
} from '../../domain/stock-count.entity';
import { BusinessRuleError } from '../errors';
import { StockMovementsService } from './stock-movements.service';
import { InventoryValuationEventsService } from './inventory-valuation-events.service';

const NUMBERING: Record<StockCountKind, { documentType: string; prefix: string }> = {
  opening: { documentType: 'stock_opening', prefix: 'OPN-' },
  stocktake: { documentType: 'stock_count', prefix: 'CNT-' },
};
const MAX_LINES_PER_CALL = 5000;

/**
 * Opening balances (رصيد أول المدة) and stocktakes (الجرد) — see migration
 * 0078. Both are drafts the user fills in (typed, scanned or pasted from
 * Excel) and then posts in one transaction:
 *  - opening: every counted line is received as an 'in' movement at its
 *    unit cost (reference 'opening_balance');
 *  - stocktake: every counted line sets on-hand to the counted quantity via
 *    an adjustment movement for the difference against the LIVE quantity at
 *    posting (reference 'stock_count'); uncounted lines are skipped.
 * Posting also writes 'inventory.stock_count.posted' to the outbox with the
 * value of every change, for Accounting to post the inventory adjustment.
 */
@Injectable()
export class StockCountsService {
  constructor(
    @Inject(STOCK_COUNT_REPOSITORY) private readonly counts: StockCountRepository,
    @Inject(STOCK_LOT_REPOSITORY) private readonly lots: StockLotRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly stockMovements: StockMovementsService,
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
    private readonly valuationEvents: InventoryValuationEventsService,
  ) {}

  list(db: Kysely<TenantDatabase>, kind?: StockCountKind): Promise<StockCount[]> {
    return this.counts.list(db, { kind });
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<StockCountWithLines> {
    const count = await this.counts.findById(db, id);
    if (!count) throw entityNotFound('STOCK_COUNT', id);
    return { ...count, lines: await this.counts.listLines(db, id) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateStockCountInput,
    createdBy: string | null,
  ): Promise<StockCountWithLines> {
    await this.defaultLocationId(db, input.warehouseId);
    return withTransaction(db, async (trx) => {
      const { documentType, prefix } = NUMBERING[input.kind];
      // Created on demand so a new tenant can count stock without first
      // visiting Settings › Numbering.
      await this.numbering.ensureTenantWide(trx, documentType, { prefix, paddingLength: 5 });
      const allocated = await this.numbering.allocateNext(trx, documentType, null);
      const count = await this.counts.create(trx, {
        countNumber: allocated.formatted,
        kind: input.kind,
        warehouseId: input.warehouseId,
        countDate: input.countDate ?? null,
        notes: input.notes ?? null,
        createdBy,
      });
      return { ...count, lines: [] };
    });
  }

  async updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: { countDate?: string | null; notes?: string | null },
  ): Promise<StockCount> {
    await this.draft(db, id);
    return (await this.counts.updateHeader(db, id, input))!;
  }

  /**
   * Adds or updates lines (keyed by variant + location + lot). New stocktake
   * lines snapshot the current on-hand as their system quantity.
   */
  async upsertLines(
    db: Kysely<TenantDatabase>,
    id: string,
    lines: UpsertStockCountLineInput[],
  ): Promise<StockCountWithLines> {
    const count = await this.draft(db, id);
    if (lines.length > MAX_LINES_PER_CALL) {
      throw new BusinessRuleError(`At most ${MAX_LINES_PER_CALL} lines per request.`, {
        code: 'STOCK_COUNT.TOO_MANY_LINES',
        params: { max: MAX_LINES_PER_CALL },
      });
    }
    const defaultLocationId = await this.defaultLocationId(db, count.warehouseId);
    const warehouseLocationIds = new Set(
      (await this.locations.listByWarehouseId(db, count.warehouseId)).map((location) => location.id),
    );
    const trackingCache = new Map<string, { trackingType: 'none' | 'lot' | 'serial'; name: string }>();

    await withTransaction(db, async (trx) => {
      for (const line of lines) {
        const locationId = line.locationId ?? defaultLocationId;
        if (!warehouseLocationIds.has(locationId)) {
          throw new BusinessRuleError('The location does not belong to this count’s warehouse.', {
            code: 'STOCK_COUNT.LOCATION_NOT_IN_WAREHOUSE',
          });
        }
        const product = await this.productInfo(trx, line.productVariantId, trackingCache);
        const lotNumber = line.lotNumber?.trim() || null;
        if (product.trackingType === 'none' && lotNumber) {
          throw new BusinessRuleError(
            `"${product.name}" is not lot/serial-tracked, so its line must not carry a lot.`,
            {
              code: 'STOCK_COUNT.LOT_NOT_TRACKED',
              params: { name: product.name },
            },
          );
        }
        if (product.trackingType !== 'none' && !lotNumber) {
          throw new BusinessRuleError(`"${product.name}" is lot/serial-tracked — enter the lot or serial number.`, {
            code: 'STOCK_COUNT.LOT_REQUIRED',
            params: { name: product.name },
          });
        }
        if (line.countedQuantity !== null) {
          if (!Number.isFinite(line.countedQuantity) || line.countedQuantity < 0) {
            throw new BusinessRuleError('A counted quantity cannot be negative.', {
              code: 'STOCK_COUNT.NEGATIVE_QUANTITY',
            });
          }
          if (product.trackingType === 'serial' && line.countedQuantity > 1) {
            throw new BusinessRuleError(`Serial "${lotNumber}" can only be counted as 0 or 1.`, {
              code: 'STOCK_COUNT.SERIAL_QUANTITY',
              params: { lotNumber: lotNumber ?? '' },
            });
          }
        }
        if (line.unitCost?.isNegative()) {
          throw new BusinessRuleError('A unit cost cannot be negative.', { code: 'STOCK_COUNT.NEGATIVE_COST' });
        }
        const systemQuantity =
          count.kind === 'stocktake'
            ? await this.counts.currentQuantity(trx, line.productVariantId, locationId, lotNumber)
            : 0;
        await this.counts.upsertLine(trx, id, {
          productVariantId: line.productVariantId,
          locationId,
          lotNumber,
          expiryDate: line.expiryDate || null,
          systemQuantity,
          countedQuantity: line.countedQuantity,
          unitCost: line.unitCost ?? null,
        });
      }
    });
    return this.getById(db, id);
  }

  async deleteLine(db: Kysely<TenantDatabase>, id: string, lineId: string): Promise<void> {
    await this.draft(db, id);
    if (!(await this.counts.deleteLine(db, id, lineId))) throw entityNotFound('STOCK_COUNT_LINE', lineId);
  }

  /**
   * Stocktake: adds every item with stock in the warehouse (per lot for
   * tracked items) that isn't on the count yet — optionally only some
   * locations (shelf-by-shelf cycle counting) and/or categories.
   */
  async loadStock(
    db: Kysely<TenantDatabase>,
    id: string,
    filter: { categoryIds?: string[]; locationIds?: string[] },
  ): Promise<StockCountWithLines> {
    const count = await this.draft(db, id);
    if (count.kind !== 'stocktake') {
      throw new BusinessRuleError('Only a stocktake can be filled from current stock.', {
        code: 'STOCK_COUNT.LOAD_ONLY_STOCKTAKE',
      });
    }
    const existing = new Set(
      (await this.counts.listLines(db, id)).map((line) =>
        lineKey(line.productVariantId, line.locationId, line.lotNumber),
      ),
    );
    if (filter.locationIds?.length) {
      const own = new Set((await this.locations.listByWarehouseId(db, count.warehouseId)).map((location) => location.id));
      if (filter.locationIds.some((locationId) => !own.has(locationId))) {
        throw new BusinessRuleError('The location does not belong to this count’s warehouse.', {
          code: 'STOCK_COUNT.LOCATION_NOT_IN_WAREHOUSE',
        });
      }
    }
    const rows = await this.counts.listCountableStock(db, count.warehouseId, filter);
    await withTransaction(db, async (trx) => {
      for (const row of rows) {
        if (existing.has(lineKey(row.productVariantId, row.locationId, row.lotNumber))) continue;
        await this.counts.upsertLine(trx, id, {
          productVariantId: row.productVariantId,
          locationId: row.locationId,
          lotNumber: row.lotNumber,
          expiryDate: row.expiryDate,
          systemQuantity: row.quantity,
          countedQuantity: null,
          unitCost: null,
        });
      }
    });
    return this.getById(db, id);
  }

  /** Stocktake: re-reads the system quantity of every line (after sales/receipts happened while counting). */
  async refreshSystemQuantities(db: Kysely<TenantDatabase>, id: string): Promise<StockCountWithLines> {
    const count = await this.draft(db, id);
    if (count.kind === 'stocktake') {
      for (const line of await this.counts.listLines(db, id)) {
        const current = await this.counts.currentQuantity(db, line.productVariantId, line.locationId, line.lotNumber);
        if (current !== line.systemQuantity) await this.counts.setSystemQuantity(db, line.id, current);
      }
    }
    return this.getById(db, id);
  }

  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<{ count: StockCountWithLines; changes: StockCountPostingLine[] }> {
    const changes = await withTransaction(db, async (trx) => {
      await this.counts.lockForUpdate(trx, id);
      const count = await this.draft(trx, id);
      const lines = (await this.counts.listLines(trx, id)).filter((line) => line.countedQuantity !== null);
      if (lines.length === 0) {
        throw new BusinessRuleError('Nothing to post — no line has a counted quantity.', {
          code: 'STOCK_COUNT.NOTHING_TO_POST',
        });
      }
      await this.stockMovements.lockVariants(
        trx,
        lines.map((line) => line.productVariantId),
      );
      const result =
        count.kind === 'opening'
          ? await this.postOpening(trx, count, lines, actorUserId)
          : await this.postStocktake(trx, count, lines, actorUserId);
      await this.counts.setStatus(trx, id, 'posted', actorUserId);

      if (result.length > 0) {
        const currency = result[0]!.unitCost.currency;
        let increase = Money.zero(currency);
        let decrease = Money.zero(currency);
        for (const change of result.filter((candidate) => candidate.value.currency === currency)) {
          if (change.quantityDelta > 0) increase = increase.add(change.value);
          else decrease = decrease.add(change.value);
        }
        // The journal entry: opening → Inventory / Opening balances; stocktake → gain / loss.
        await this.valuationEvents.write(trx, {
          schema,
          actorUserId,
          sourceType: count.kind === 'opening' ? 'opening_balance' : 'stock_count',
          sourceId: id,
          documentNumber: count.countNumber,
          entryDate: count.countDate,
          description:
            count.kind === 'opening' ? `رصيد أول المدة ${count.countNumber}` : `فروق جرد ${count.countNumber}`,
          entries:
            count.kind === 'opening'
              ? [{ kind: 'opening', amount: increase }]
              : [
                  { kind: 'adjustment_gain', amount: increase },
                  { kind: 'adjustment_loss', amount: decrease },
                ],
        });
        await this.outbox.write(trx, 'inventory.stock_count.posted', {
          schema,
          entityType: 'stock_count',
          entityId: id,
          action: 'posted',
          actorUserId,
          metadata: {
            kind: count.kind,
            countNumber: count.countNumber,
            warehouseId: count.warehouseId,
            currency,
            totalIncrease: { amountMinorUnits: increase.toMinorUnits().toString(), currency },
            totalDecrease: { amountMinorUnits: decrease.toMinorUnits().toString(), currency },
            lines: result.map((change) => ({
              productVariantId: change.productVariantId,
              lotNumber: change.lotNumber,
              quantityDelta: change.quantityDelta,
              unitCost: {
                amountMinorUnits: change.unitCost.toMinorUnits().toString(),
                currency: change.unitCost.currency,
              },
            })),
          },
          occurredAt: new Date(),
        });
      }
      return result;
    });
    return { count: await this.getById(db, id), changes };
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<StockCount> {
    await this.draft(db, id);
    return (await this.counts.setStatus(db, id, 'cancelled'))!;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.draft(db, id);
    await this.counts.delete(db, id);
  }

  private async postOpening(
    trx: Kysely<TenantDatabase>,
    count: StockCount,
    lines: StockCountLine[],
    actorUserId: string | null,
  ): Promise<StockCountPostingLine[]> {
    const changes: StockCountPostingLine[] = [];
    for (const line of lines) {
      if (line.countedQuantity === 0) continue;
      if (!line.unitCost) {
        const product = await this.productInfo(trx, line.productVariantId, new Map());
        throw new BusinessRuleError(`Enter the unit cost of "${product.name}" for its opening balance.`, {
          code: 'STOCK_COUNT.OPENING_COST_REQUIRED',
          params: { name: product.name },
        });
      }
      const movement = await this.stockMovements.recordMovement(trx, {
        productVariantId: line.productVariantId,
        locationId: line.locationId,
        movementType: 'in',
        quantity: line.countedQuantity!,
        unitCost: line.unitCost,
        lotNumber: line.lotNumber ?? undefined,
        expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00`) : null,
        referenceType: 'opening_balance',
        referenceId: count.id,
        notes: count.countNumber,
        createdBy: actorUserId,
      });
      changes.push({
        productVariantId: line.productVariantId,
        lotNumber: line.lotNumber,
        quantityDelta: line.countedQuantity!,
        unitCost: movement.unitCost ?? line.unitCost,
        value: movement.totalCost ?? line.unitCost.multiplyByQuantity(line.countedQuantity!),
      });
    }
    return changes;
  }

  private async postStocktake(
    trx: Kysely<TenantDatabase>,
    count: StockCount,
    lines: StockCountLine[],
    actorUserId: string | null,
  ): Promise<StockCountPostingLine[]> {
    const changes: StockCountPostingLine[] = [];
    for (const line of lines) {
      const current = await this.counts.currentQuantity(trx, line.productVariantId, line.locationId, line.lotNumber);
      const delta = roundQuantity(line.countedQuantity! - current);
      if (delta === 0) continue;
      let lotId: string | undefined;
      if (line.lotNumber && delta < 0) {
        lotId = (await this.lots.findByVariantAndLotNumber(trx, line.productVariantId, line.lotNumber))?.id;
      }
      const movement = await this.stockMovements.recordMovement(trx, {
        productVariantId: line.productVariantId,
        locationId: line.locationId,
        movementType: delta > 0 ? 'adjustment_increase' : 'adjustment_decrease',
        quantity: Math.abs(delta),
        unitCost: delta > 0 ? (line.unitCost ?? undefined) : undefined,
        lotNumber: delta > 0 ? (line.lotNumber ?? undefined) : undefined,
        expiryDate: delta > 0 && line.expiryDate ? new Date(`${line.expiryDate}T00:00:00`) : undefined,
        lotId,
        referenceType: 'stock_count',
        referenceId: count.id,
        notes: count.countNumber,
        createdBy: actorUserId,
      });
      changes.push({
        productVariantId: line.productVariantId,
        lotNumber: line.lotNumber,
        quantityDelta: delta,
        unitCost: movement.unitCost ?? movement.resultingAverageCost,
        value: movement.totalCost ?? (movement.unitCost ?? movement.resultingAverageCost).multiplyByQuantity(Math.abs(delta)),
      });
    }
    return changes;
  }

  private async draft(db: Kysely<TenantDatabase>, id: string): Promise<StockCount> {
    const count = await this.counts.findById(db, id);
    if (!count) throw entityNotFound('STOCK_COUNT', id);
    if (count.status !== 'draft') {
      throw new BusinessRuleError(`Stock count "${count.countNumber}" is ${count.status} and can no longer change.`, {
        code: 'STOCK_COUNT.NOT_DRAFT',
        params: { number: count.countNumber, status: count.status },
      });
    }
    return count;
  }

  private async defaultLocationId(db: Kysely<TenantDatabase>, warehouseId: string): Promise<string> {
    const locations = await this.locations.listByWarehouseId(db, warehouseId);
    const location = locations.find((candidate) => candidate.code === DEFAULT_LOCATION_CODE) ?? locations[0];
    if (!location) throw entityNotFound('WAREHOUSE', warehouseId);
    return location.id;
  }

  private async productInfo(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    cache: Map<string, { trackingType: 'none' | 'lot' | 'serial'; name: string }>,
  ): Promise<{ trackingType: 'none' | 'lot' | 'serial'; name: string }> {
    const cached = cache.get(productVariantId);
    if (cached) return cached;
    const variant = await this.variants.findById(db, productVariantId);
    if (!variant) throw entityNotFound('PRODUCT_VARIANT', productVariantId);
    const product = await this.products.findById(db, variant.productId);
    if (!product) throw entityNotFound('PRODUCT', variant.productId);
    if (product.itemType === 'service') {
      throw new BusinessRuleError(`"${product.name}" is a service item and has no stock.`, {
        code: 'STOCK_MOVEMENT.SERVICE_ITEM',
        params: { name: product.name },
      });
    }
    const info = { trackingType: product.trackingType, name: product.name };
    cache.set(productVariantId, info);
    return info;
  }
}

function lineKey(productVariantId: string, locationId: string, lotNumber: string | null): string {
  return `${productVariantId}|${locationId}|${lotNumber ?? ''}`;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
