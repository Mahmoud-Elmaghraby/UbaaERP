import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';
import { ProductUnitResolver } from '../../../../shared/catalog/product-unit-resolver';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { STOCK_ADJUSTMENT_REPOSITORY, type StockAdjustmentRepository } from '../ports/stock-adjustment.repository';
import { WAREHOUSE_REPOSITORY, type WarehouseRepository } from '../ports/warehouse.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../ports/warehouse-location.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { STOCK_LOT_REPOSITORY, type StockLotRepository } from '../ports/stock-lot.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import type { RecordStockMovementInput, StockMovement } from '../../domain/stock-movement.entity';
import type { Product } from '../../domain/product.entity';
import type {
  CreateStockAdjustmentInput,
  StockAdjustment,
  StockAdjustmentLine,
  StockAdjustmentLineInput,
  StockAdjustmentReason,
  StockAdjustmentReasonInput,
  StockAdjustmentStatus,
  StockAdjustmentWithLines,
} from '../../domain/stock-adjustment.entity';
import { BusinessRuleError, ConflictError } from '../errors';
import { StockMovementsService } from './stock-movements.service';
import { InventoryValuationEventsService, type ValuationEntryInput } from './inventory-valuation-events.service';

const REFERENCE_TYPE = 'stock_adjustment';
const MAX_LINES = 2000;

interface ActorContext {
  schema: string;
  userId: string | null;
}

/**
 * Stock adjustments (إذن إضافة / إذن صرف — migration 0084): the only way
 * stock changes by hand. Posting records one movement per line (per lot
 * for tracked items), stores the exact value each line moved, and writes
 * one 'inventory.valuation.posted' event so Accounting books the gain or
 * loss against the reason's account (or its default adjustment account).
 */
@Injectable()
export class StockAdjustmentsService {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY) private readonly adjustments: StockAdjustmentRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouses: WarehouseRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STOCK_LOT_REPOSITORY) private readonly lots: StockLotRepository,
    private readonly stockMovements: StockMovementsService,
    private readonly numbering: NumberingSequencesService,
    private readonly units: ProductUnitResolver,
    private readonly valuationEvents: InventoryValuationEventsService,
  ) {}

  // ---- reasons ---------------------------------------------------------

  listReasons(db: Kysely<TenantDatabase>): Promise<StockAdjustmentReason[]> {
    return this.adjustments.listReasons(db);
  }

  async createReason(db: Kysely<TenantDatabase>, input: StockAdjustmentReasonInput): Promise<StockAdjustmentReason> {
    try {
      return await this.adjustments.createReason(db, { ...input, name: input.name.trim() });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw this.duplicateReason(input.name);
      throw err;
    }
  }

  async updateReason(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<StockAdjustmentReasonInput>,
  ): Promise<StockAdjustmentReason> {
    try {
      const updated = await this.adjustments.updateReason(db, id, {
        ...input,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      });
      if (!updated) throw entityNotFound('STOCK_ADJUSTMENT_REASON', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw this.duplicateReason(input.name ?? '');
      throw err;
    }
  }

  /** A reason already used on a document is deactivated instead (kept for history). */
  async deleteReason(db: Kysely<TenantDatabase>, id: string): Promise<{ deleted: boolean }> {
    if (!(await this.adjustments.findReason(db, id))) throw entityNotFound('STOCK_ADJUSTMENT_REASON', id);
    if (await this.adjustments.reasonInUse(db, id)) {
      await this.adjustments.updateReason(db, id, { isActive: false });
      return { deleted: false };
    }
    await this.adjustments.deleteReason(db, id);
    return { deleted: true };
  }

  // ---- documents -------------------------------------------------------

  list(
    db: Kysely<TenantDatabase>,
    filter: { status?: StockAdjustmentStatus; warehouseId?: string } = {},
  ): Promise<StockAdjustment[]> {
    return this.adjustments.list(db, filter);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustmentWithLines> {
    const adjustment = await this.adjustments.findById(db, id);
    if (!adjustment) throw entityNotFound('STOCK_ADJUSTMENT', id);
    return { ...adjustment, lines: await this.adjustments.listLines(db, id) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateStockAdjustmentInput,
    createdBy: string | null,
  ): Promise<StockAdjustmentWithLines> {
    const locationId = await this.locationOf(db, input.warehouseId, input.locationId);
    if (input.reasonId) await this.activeReason(db, input.reasonId);
    const lines = await this.prepareLines(db, input.lines);
    const id = await withTransaction(db, async (trx) => {
      const adjustment = await this.createHeader(trx, { ...input, locationId }, createdBy);
      await this.adjustments.replaceLines(trx, adjustment.id, lines);
      return adjustment.id;
    });
    return this.getById(db, id);
  }

  /** Create and post in one transaction — nothing is left behind when posting fails. */
  async createAndPost(
    db: Kysely<TenantDatabase>,
    input: CreateStockAdjustmentInput,
    actor: ActorContext,
  ): Promise<StockAdjustmentWithLines> {
    const id = await withTransaction(db, async (trx) => {
      const created = await this.create(trx, input, actor.userId);
      await this.post(trx, created.id, actor);
      return created.id;
    });
    return this.getById(db, id);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<CreateStockAdjustmentInput>,
  ): Promise<StockAdjustmentWithLines> {
    const current = await this.draft(db, id);
    const warehouseId = input.warehouseId ?? current.warehouseId;
    const locationId = await this.locationOf(
      db,
      warehouseId,
      input.locationId !== undefined ? input.locationId : warehouseId === current.warehouseId ? current.locationId : null,
    );
    if (input.reasonId) await this.activeReason(db, input.reasonId);
    const lines = input.lines ? await this.prepareLines(db, input.lines) : null;
    await withTransaction(db, async (trx) => {
      await this.adjustments.lockForUpdate(trx, id);
      await this.draft(trx, id);
      await this.adjustments.updateHeader(trx, id, {
        warehouseId,
        locationId,
        ...(input.reasonId !== undefined ? { reasonId: input.reasonId ?? null } : {}),
        ...(input.adjustmentDate ? { adjustmentDate: input.adjustmentDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      });
      if (lines) await this.adjustments.replaceLines(trx, id, lines);
    });
    return this.getById(db, id);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.draft(db, id);
    await this.adjustments.delete(db, id);
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustmentWithLines> {
    await this.draft(db, id);
    await this.adjustments.setStatus(db, id, 'cancelled');
    return this.getById(db, id);
  }

  async post(db: Kysely<TenantDatabase>, id: string, actor: ActorContext): Promise<StockAdjustmentWithLines> {
    await withTransaction(db, async (trx) => {
      await this.adjustments.lockForUpdate(trx, id);
      const adjustment = await this.draft(trx, id);
      const lines = await this.adjustments.listLines(trx, id);
      if (lines.length === 0) {
        throw new BusinessRuleError('The adjustment has no lines.', { code: 'STOCK_ADJUSTMENT.NO_LINES' });
      }
      await this.stockMovements.lockVariants(
        trx,
        lines.map((line) => line.productVariantId),
      );
      const reasons = new Map((await this.adjustments.listReasons(trx)).map((reason) => [reason.id, reason]));
      const entries: ValuationEntryInput[] = [];
      for (const line of lines) {
        const reasonId = line.reasonId ?? adjustment.reasonId;
        const reason = reasonId ? reasons.get(reasonId) : undefined;
        if (reason && reason.direction !== 'both' && reason.direction !== line.direction) {
          throw new BusinessRuleError(`The reason "${reason.name}" cannot be used for this direction.`, {
            code: 'STOCK_ADJUSTMENT.REASON_DIRECTION',
            params: { name: reason.name },
          });
        }
        const value = await this.postLine(trx, adjustment, line, actor.userId);
        await this.adjustments.setPostedValue(trx, line.id, value);
        entries.push({
          kind: line.direction === 'increase' ? 'adjustment_gain' : 'adjustment_loss',
          amount: value,
          counterAccountId: reason?.accountId ?? null,
        });
      }
      await this.adjustments.setStatus(trx, id, 'posted', actor.userId);
      await this.valuationEvents.write(trx, {
        schema: actor.schema,
        actorUserId: actor.userId,
        sourceType: 'stock_adjustment',
        sourceId: id,
        documentNumber: adjustment.adjustmentNumber,
        entryDate: adjustment.adjustmentDate,
        description: `تسوية مخزون ${adjustment.adjustmentNumber}`,
        entries,
      });
    });
    return this.getById(db, id);
  }

  /**
   * The quick "record movement" dialog: one line, created and posted at
   * once. Units go through StockMovementsService's own conversion (any
   * convertible unit), so the line is stored in base units.
   */
  async quick(
    db: Kysely<TenantDatabase>,
    input: RecordStockMovementInput & { reasonId?: string | null },
    actor: ActorContext,
  ): Promise<{ adjustment: StockAdjustmentWithLines; movement: StockMovement }> {
    const location = await this.locations.findById(db, input.locationId);
    if (!location) throw entityNotFound('WAREHOUSE_LOCATION', input.locationId);
    if (input.reasonId) await this.activeReason(db, input.reasonId);
    const direction = input.movementType === 'in' || input.movementType === 'adjustment_increase' ? 'increase' : 'decrease';
    const result = await withTransaction(db, async (trx) => {
      const adjustment = await this.createHeader(
        trx,
        {
          warehouseId: location.warehouseId,
          locationId: location.id,
          reasonId: input.reasonId ?? null,
          notes: input.notes ?? null,
        },
        actor.userId,
      );
      const movement = await this.stockMovements.recordMovement(trx, {
        ...input,
        referenceType: REFERENCE_TYPE,
        referenceId: adjustment.id,
        notes: input.notes ?? adjustment.adjustmentNumber,
        createdBy: actor.userId,
      });
      const value = movement.totalCost ?? Money.zero(movement.resultingAverageCost.currency);
      await this.adjustments.replaceLines(trx, adjustment.id, [
        {
          productVariantId: input.productVariantId,
          direction,
          quantity: movement.quantity,
          unitOfMeasureId: null,
          unitFactor: 1,
          unitCost: direction === 'increase' ? movement.unitCost : null,
          lotNumber: input.lotNumber ?? null,
          expiryDate: input.expiryDate ? localDate(input.expiryDate) : null,
          reasonId: null,
          notes: null,
        },
      ]);
      const [line] = await this.adjustments.listLines(trx, adjustment.id);
      await this.adjustments.setPostedValue(trx, line!.id, value);
      await this.adjustments.setStatus(trx, adjustment.id, 'posted', actor.userId);
      const reason = input.reasonId ? await this.adjustments.findReason(trx, input.reasonId) : null;
      await this.valuationEvents.write(trx, {
        schema: actor.schema,
        actorUserId: actor.userId,
        sourceType: 'stock_adjustment',
        sourceId: adjustment.id,
        documentNumber: adjustment.adjustmentNumber,
        entryDate: adjustment.adjustmentDate,
        description: `تسوية مخزون ${adjustment.adjustmentNumber}`,
        entries: [
          {
            kind: direction === 'increase' ? 'adjustment_gain' : 'adjustment_loss',
            amount: value,
            counterAccountId: reason?.accountId ?? null,
          },
        ],
      });
      return { id: adjustment.id, movement };
    });
    return { adjustment: await this.getById(db, result.id), movement: result.movement };
  }

  // ---- internals -------------------------------------------------------

  private async postLine(
    trx: Kysely<TenantDatabase>,
    adjustment: StockAdjustment,
    line: StockAdjustmentLine,
    userId: string | null,
  ): Promise<Money> {
    const product = await this.productOf(trx, line.productVariantId);
    const quantity = Math.round(line.quantity * line.unitFactor * 10_000) / 10_000;
    const common = {
      productVariantId: line.productVariantId,
      locationId: adjustment.locationId,
      referenceType: REFERENCE_TYPE,
      referenceId: adjustment.id,
      notes: line.notes ?? adjustment.adjustmentNumber,
      createdBy: userId,
    };
    if (line.direction === 'increase') {
      // Cost per base unit: the typed cost, else (no stock to average from) the item's purchase price.
      let unitCost = line.unitCost ? line.unitCost.divideByQuantity(line.unitFactor) : undefined;
      if (!unitCost && product.purchasePrice) {
        const level = (await this.stockMovements.listStockLevels(trx, {
          locationId: adjustment.locationId,
          productVariantId: line.productVariantId,
        }))[0];
        if (!level || level.quantityOnHand <= 0) unitCost = product.purchasePrice;
      }
      const movement = await this.stockMovements.recordMovement(trx, {
        ...common,
        movementType: 'adjustment_increase',
        quantity,
        unitCost,
        totalCost: line.unitCost ? line.unitCost.multiplyByQuantity(line.quantity) : undefined,
        lotNumber: line.lotNumber ?? undefined,
        expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00`) : null,
      });
      return movement.totalCost ?? Money.zero(movement.resultingAverageCost.currency);
    }

    const pieces = line.lotNumber
      ? [{ lotId: await this.lotIdOf(trx, product, line), quantity }]
      : ((await this.stockMovements.planOutgoingLots(trx, {
          productVariantId: line.productVariantId,
          locationId: adjustment.locationId,
          quantity,
          blockExpired: false,
        })) ?? [{ lotId: undefined as string | undefined, quantity }]);
    let total: Money | null = null;
    for (const piece of pieces) {
      const movement = await this.stockMovements.recordMovement(trx, {
        ...common,
        movementType: 'adjustment_decrease',
        quantity: piece.quantity,
        lotId: piece.lotId,
      });
      const value = movement.totalCost ?? Money.zero(movement.resultingAverageCost.currency);
      total = total ? total.add(value) : value;
    }
    return total!;
  }

  private async lotIdOf(trx: Kysely<TenantDatabase>, product: Product, line: StockAdjustmentLine): Promise<string> {
    const lot = await this.lots.findByVariantAndLotNumber(trx, line.productVariantId, line.lotNumber!.trim());
    if (!lot) {
      throw new BusinessRuleError(`Lot "${line.lotNumber}" does not exist for "${product.name}".`, {
        code: 'STOCK_MOVEMENT.LOT_NOT_FOUND',
        params: { lotNumber: line.lotNumber ?? '', name: product.name },
      });
    }
    return lot.id;
  }

  private async createHeader(
    trx: Kysely<TenantDatabase>,
    input: {
      warehouseId: string;
      locationId: string;
      reasonId?: string | null;
      adjustmentDate?: string | null;
      notes?: string | null;
    },
    createdBy: string | null,
  ): Promise<StockAdjustment> {
    await this.numbering.ensureTenantWide(trx, 'stock_adjustment', { prefix: 'ADJ-', paddingLength: 5 });
    const allocated = await this.numbering.allocateNext(trx, 'stock_adjustment', null);
    return this.adjustments.create(trx, {
      adjustmentNumber: allocated.formatted,
      warehouseId: input.warehouseId,
      locationId: input.locationId,
      reasonId: input.reasonId ?? null,
      adjustmentDate: input.adjustmentDate ?? null,
      notes: input.notes ?? null,
      createdBy,
    });
  }

  private async prepareLines(db: Kysely<TenantDatabase>, lines: StockAdjustmentLineInput[]) {
    if (lines.length === 0) {
      throw new BusinessRuleError('The adjustment has no lines.', { code: 'STOCK_ADJUSTMENT.NO_LINES' });
    }
    if (lines.length > MAX_LINES) {
      throw new BusinessRuleError(`At most ${MAX_LINES} lines.`, {
        code: 'STOCK_ADJUSTMENT.TOO_MANY_LINES',
        params: { max: MAX_LINES },
      });
    }
    const resolved = await this.units.resolve(
      db,
      lines.map((line) => ({ ...line, unitOfMeasureId: line.unitOfMeasureId ?? null })),
    );
    const result = [];
    for (const line of resolved) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new BusinessRuleError('Stock movement quantity must be a positive number.', {
          code: 'STOCK_MOVEMENT.QUANTITY_MUST_BE_POSITIVE',
        });
      }
      if (line.unitCost?.isNegative()) {
        throw new BusinessRuleError('A stock movement unit cost cannot be negative.', {
          code: 'STOCK_MOVEMENT.UNIT_COST_NEGATIVE',
        });
      }
      const product = await this.productOf(db, line.productVariantId);
      const lotNumber = line.lotNumber?.trim() || null;
      if (product.trackingType === 'none' && lotNumber) {
        throw new BusinessRuleError(`"${product.name}" is not lot/serial-tracked, so its line must not carry a lot.`, {
          code: 'STOCK_COUNT.LOT_NOT_TRACKED',
          params: { name: product.name },
        });
      }
      if (product.trackingType !== 'none' && line.direction === 'increase' && !lotNumber) {
        throw new BusinessRuleError(`"${product.name}" is lot/serial-tracked — enter the lot or serial number.`, {
          code: 'STOCK_COUNT.LOT_REQUIRED',
          params: { name: product.name },
        });
      }
      if (line.reasonId) await this.activeReason(db, line.reasonId);
      result.push({
        productVariantId: line.productVariantId,
        direction: line.direction,
        quantity: line.quantity,
        unitOfMeasureId: line.unitOfMeasureId,
        unitFactor: line.unitFactor,
        unitCost: line.direction === 'increase' ? (line.unitCost ?? null) : null,
        lotNumber,
        expiryDate: line.direction === 'increase' ? (line.expiryDate ?? null) : null,
        reasonId: line.reasonId ?? null,
        notes: line.notes ?? null,
      });
    }
    return result;
  }

  private async productOf(db: Kysely<TenantDatabase>, productVariantId: string): Promise<Product> {
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
    return product;
  }

  private async activeReason(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustmentReason> {
    const reason = await this.adjustments.findReason(db, id);
    if (!reason) throw entityNotFound('STOCK_ADJUSTMENT_REASON', id);
    if (!reason.isActive) {
      throw new BusinessRuleError(`The reason "${reason.name}" is inactive.`, {
        code: 'STOCK_ADJUSTMENT.REASON_INACTIVE',
        params: { name: reason.name },
      });
    }
    return reason;
  }

  private async locationOf(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    locationId: string | null | undefined,
  ): Promise<string> {
    const warehouse = await this.warehouses.findById(db, warehouseId);
    if (!warehouse) throw entityNotFound('WAREHOUSE', warehouseId);
    const locations = await this.locations.listByWarehouseId(db, warehouseId);
    if (locationId) {
      if (!locations.some((location) => location.id === locationId)) {
        throw new BusinessRuleError('The location does not belong to this warehouse.', {
          code: 'STOCK_TRANSFER.LOCATION_NOT_IN_WAREHOUSE',
        });
      }
      return locationId;
    }
    const location = locations.find((candidate) => candidate.code === DEFAULT_LOCATION_CODE) ?? locations[0];
    if (!location) throw entityNotFound('WAREHOUSE_LOCATION', warehouseId);
    return location.id;
  }

  private async draft(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustment> {
    const adjustment = await this.adjustments.findById(db, id);
    if (!adjustment) throw entityNotFound('STOCK_ADJUSTMENT', id);
    if (adjustment.status !== 'draft') {
      throw new BusinessRuleError(`Adjustment "${adjustment.adjustmentNumber}" is ${adjustment.status}.`, {
        code: 'STOCK_ADJUSTMENT.NOT_DRAFT',
        params: { number: adjustment.adjustmentNumber },
      });
    }
    return adjustment;
  }

  private duplicateReason(name: string): ConflictError {
    return new ConflictError(`A reason named "${name}" already exists.`, {
      code: 'STOCK_ADJUSTMENT.REASON_DUPLICATE',
      params: { name },
    });
  }
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
