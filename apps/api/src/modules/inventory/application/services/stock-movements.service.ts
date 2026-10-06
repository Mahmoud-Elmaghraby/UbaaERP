import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { STOCK_LEVEL_REPOSITORY, type StockLevelRepository } from '../ports/stock-level.repository';
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepository } from '../ports/stock-movement.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../ports/warehouse-location.repository';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import { STOCK_LOT_REPOSITORY, type StockLotRepository } from '../ports/stock-lot.repository';
import { UnitsOfMeasureService } from './units-of-measure.service';
import type { StockLevel } from '../../domain/stock-level.entity';
import type { StockLotWithLevels } from '../../domain/stock-lot.entity';
import type { Product } from '../../domain/product.entity';
import type {
  RecordStockMovementInput,
  StockMovement,
  StockMovementType,
  TransferStockInput,
  TransferStockResult,
} from '../../domain/stock-movement.entity';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { withTransaction } from '../../../../database/tenant/transaction.util';

interface IncomingParams {
  productVariantId: string;
  locationId: string;
  movementType: Extract<StockMovementType, 'in' | 'adjustment_increase' | 'transfer_in'>;
  quantity: number;
  unitCost?: Money;
  product: Product;
  /** 'in'/'adjustment_increase' on a lot-tracked product: the lot to receive into (created if new). */
  lotNumber?: string;
  expiryDate?: Date | null;
  /** 'transfer_in' on a lot-tracked product: the existing lot being relocated (never creates a new lot). */
  lotId?: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

interface OutgoingParams {
  productVariantId: string;
  locationId: string;
  movementType: Extract<StockMovementType, 'out' | 'adjustment_decrease' | 'transfer_out'>;
  quantity: number;
  product: Product;
  /** Consume from this specific lot instead of FIFO-by-expiry across all lots at the location. */
  lotId?: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

/**
 * Owns the real domain rules Inventory's schema has invariants for
 * (CLAUDE.md §2.1 — Inventory is not in the "strong aggregate" list, but
 * "no negative stock" plus weighted-average valuation are still real
 * domain rules that don't belong in a controller or a plain-CRUD repository):
 *
 *  - Weighted-average costing (master doc §16.3): every 'in' movement
 *    recalculates a (variant, location) stock_levels row's average_cost
 *    from the incoming quantity/cost; 'out' movements never change it —
 *    they just consume at the current average.
 *  - No negative stock: an outgoing movement larger than quantity_on_hand
 *    is rejected (BusinessRuleError -> 422), never allowed to go negative.
 *  - A transfer between two locations (same warehouse or different ones —
 *    "same warehouse" is no longer special-cased now that locations exist,
 *    see 2026-08-28's storage-locations addition) is a single atomic pair
 *    ('transfer_out' + 'transfer_in') that carries the source location's
 *    current average cost across to the destination, rather than letting
 *    a caller assert an arbitrary transfer price.
 *  - Lot/serial tracking (2026-08-28) runs alongside the above, not
 *    instead of it: a lot/serial-tracked product still gets the exact same
 *    (variant, location) weighted-average bookkeeping in stock_levels —
 *    lot tracking is a physical FIFO-by-expiry picking concern
 *    (stock_lots/stock_lot_levels), deliberately decoupled from the
 *    costing method used for valuation. Outgoing movements default to
 *    consuming the earliest-expiring lot(s) first unless a specific lot
 *    is requested; a movement whose FIFO selection had to span more than
 *    one lot keeps a single stock_movements row (quantity only), with the
 *    per-lot breakdown recorded in stock_lot_consumptions.
 */
@Injectable()
export class StockMovementsService {
  constructor(
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevels: StockLevelRepository,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly productVariants: ProductVariantRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STOCK_LOT_REPOSITORY) private readonly stockLots: StockLotRepository,
    private readonly unitsOfMeasure: UnitsOfMeasureService,
  ) {}

  list(
    db: Kysely<TenantDatabase>,
    filter?: { productVariantId?: string; warehouseId?: string; locationId?: string; limit?: number },
  ): Promise<StockMovement[]> {
    return this.movements.list(db, filter);
  }

  listStockLevels(
    db: Kysely<TenantDatabase>,
    filter?: { warehouseId?: string; locationId?: string; productVariantId?: string },
  ): Promise<StockLevel[]> {
    return this.stockLevels.list(db, filter);
  }

  /** Lots/serials for one product variant, oldest expiry first, with their per-location quantities. */
  listLots(db: Kysely<TenantDatabase>, productVariantId: string): Promise<StockLotWithLevels[]> {
    return this.stockLots.listByVariantId(db, productVariantId);
  }

  /**
   * Pre-locks every variant a multi-line document is about to move, in a
   * stable order, so two documents sharing variants can't deadlock by
   * locking them line-by-line in different orders. `db` must be the
   * document's own transaction; recordMovement() re-acquiring a lock the
   * same transaction already holds is a no-op.
   */
  lockVariants(trx: Kysely<TenantDatabase>, productVariantIds: readonly string[]): Promise<void> {
    return this.stockLevels.lockVariants(trx, productVariantIds);
  }

  /**
   * Idempotency guard for document listeners: the outbox dispatcher
   * redelivers an event whenever any listener on it throws, so a document
   * whose movements already exist must not be applied a second time.
   */
  hasMovementsForReference(db: Kysely<TenantDatabase>, referenceType: string, referenceId: string): Promise<boolean> {
    return this.movements.existsForReference(db, referenceType, referenceId);
  }

  async setReorderPoint(
    db: Kysely<TenantDatabase>,
    stockLevelId: string,
    reorderPoint: number | null,
  ): Promise<StockLevel> {
    const updated = await this.stockLevels.setReorderPoint(db, stockLevelId, reorderPoint);
    if (!updated) throw entityNotFound('STOCK_LEVEL', stockLevelId);
    return updated;
  }

  async recordMovement(db: Kysely<TenantDatabase>, input: RecordStockMovementInput): Promise<StockMovement> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BusinessRuleError('Stock movement quantity must be a positive number.', {
        code: 'STOCK_MOVEMENT.QUANTITY_MUST_BE_POSITIVE',
      });
    }

    if (input.unitCost?.isNegative()) {
      throw new BusinessRuleError('A stock movement unit cost cannot be negative.', {
        code: 'STOCK_MOVEMENT.UNIT_COST_NEGATIVE',
      });
    }

    // withTransaction joins a caller-owned transaction (document listeners
    // apply every line of a document atomically) instead of calling
    // trx.transaction(), which Kysely rejects outright.
    return withTransaction(db, async (trx) => {
      await this.stockLevels.lockVariants(trx, [input.productVariantId]);
      const product = await this.resolveProduct(trx, input.productVariantId);
      const { quantity, unitCost } = await this.resolveBaseUnitQuantityAndCost(
        trx,
        product,
        input.unitOfMeasureId,
        input.quantity,
        input.unitCost,
      );

      switch (input.movementType) {
        case 'in':
          if (!unitCost) {
            throw new BusinessRuleError('An incoming ("in") stock movement requires a unit cost.', {
              code: 'STOCK_MOVEMENT.INCOMING_REQUIRES_UNIT_COST',
            });
          }
          return this.applyIncoming(trx, { ...input, movementType: 'in', quantity, unitCost, product });
        case 'adjustment_increase':
          return this.applyIncoming(trx, { ...input, movementType: 'adjustment_increase', quantity, unitCost, product });
        case 'out':
        case 'adjustment_decrease':
          return this.applyOutgoing(trx, { ...input, movementType: input.movementType, quantity, product });
        default: {
          const exhaustiveCheck: never = input.movementType;
          throw new BusinessRuleError(`Unsupported stock movement type "${exhaustiveCheck as string}".`, {
            code: 'STOCK_MOVEMENT.UNSUPPORTED_TYPE',
            params: { type: exhaustiveCheck as string },
          });
        }
      }
    });
  }

  private async resolveProduct(trx: Kysely<TenantDatabase>, productVariantId: string): Promise<Product> {
    const variant = await this.productVariants.findById(trx, productVariantId);
    if (!variant) throw entityNotFound('PRODUCT_VARIANT', productVariantId);
    const product = await this.products.findById(trx, variant.productId);
    if (!product) throw entityNotFound('PRODUCT', variant.productId);
    return product;
  }

  /**
   * Converts a caller-supplied quantity/cost expressed in a purchase/sale
   * unit (e.g. "box") to the product's own (base) unit of measure (e.g.
   * "piece") — stock_levels/stock_movements always persist in the
   * product's own unit. A no-op when `unitOfMeasureId` is omitted or
   * already matches the product's unit.
   */
  private async resolveBaseUnitQuantityAndCost(
    trx: Kysely<TenantDatabase>,
    product: Product,
    unitOfMeasureId: string | undefined,
    quantity: number,
    unitCost: Money | undefined,
  ): Promise<{ quantity: number; unitCost: Money | undefined }> {
    if (!unitOfMeasureId || unitOfMeasureId === product.unitOfMeasureId) return { quantity, unitCost };

    const convertedQuantity = await this.unitsOfMeasure.convert(trx, unitOfMeasureId, product.unitOfMeasureId, quantity);
    const convertedUnitCost = unitCost
      ? unitCost.multiplyByQuantity(quantity).divideByQuantity(convertedQuantity)
      : undefined;

    return { quantity: convertedQuantity, unitCost: convertedUnitCost };
  }

  async transferStock(db: Kysely<TenantDatabase>, input: TransferStockInput): Promise<TransferStockResult> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BusinessRuleError('Stock transfer quantity must be a positive number.', {
        code: 'STOCK_MOVEMENT.TRANSFER_QUANTITY_MUST_BE_POSITIVE',
      });
    }
    if (input.fromLocationId === input.toLocationId) {
      throw new BusinessRuleError('Cannot transfer stock to the same location.', {
        code: 'STOCK_MOVEMENT.TRANSFER_SAME_LOCATION',
      });
    }

    return withTransaction(db, async (trx) => {
      await this.stockLevels.lockVariants(trx, [input.productVariantId]);
      const product = await this.resolveProduct(trx, input.productVariantId);
      if (product.trackingType !== 'none' && !input.lotId) {
        throw new BusinessRuleError(
          'Transferring a lot/serial-tracked product requires specifying which lot (lotId) to transfer.',
          { code: 'STOCK_MOVEMENT.TRANSFER_REQUIRES_LOT_ID' },
        );
      }

      const transferOut = await this.applyOutgoing(trx, {
        productVariantId: input.productVariantId,
        locationId: input.fromLocationId,
        movementType: 'transfer_out',
        quantity: input.quantity,
        product,
        lotId: input.lotId,
        notes: input.notes,
        createdBy: input.createdBy,
      });

      const transferIn = await this.applyIncoming(trx, {
        productVariantId: input.productVariantId,
        locationId: input.toLocationId,
        movementType: 'transfer_in',
        quantity: input.quantity,
        unitCost: transferOut.unitCost ?? undefined,
        product,
        lotId: input.lotId,
        notes: input.notes,
        createdBy: input.createdBy,
      });

      await this.movements.linkRelatedMovement(trx, transferOut.id, transferIn.id);
      await this.movements.linkRelatedMovement(trx, transferIn.id, transferOut.id);

      return {
        transferOut: { ...transferOut, relatedMovementId: transferIn.id },
        transferIn: { ...transferIn, relatedMovementId: transferOut.id },
      };
    });
  }

  private async resolveWarehouseId(trx: Kysely<TenantDatabase>, locationId: string): Promise<string> {
    const location = await this.locations.findById(trx, locationId);
    if (!location) throw entityNotFound('WAREHOUSE_LOCATION', locationId);
    return location.warehouseId;
  }

  private async applyIncoming(trx: Kysely<TenantDatabase>, params: IncomingParams): Promise<StockMovement> {
    const warehouseId = await this.resolveWarehouseId(trx, params.locationId);
    const current = await this.stockLevels.findByVariantAndLocation(trx, params.productVariantId, params.locationId);

    let unitCost = params.unitCost;
    if (!unitCost) {
      if (!current) {
        throw new BusinessRuleError(
          'A unit cost is required: this variant has no existing stock at this location to fall back on.',
          { code: 'STOCK_MOVEMENT.UNIT_COST_REQUIRED_NO_EXISTING_STOCK' },
        );
      }
      unitCost = current.averageCost;
    }
    // An emptied location carries no value, so it can start over in a new
    // currency instead of being stuck with whatever it was first valued in.
    const hasStock = current != null && current.quantityOnHand > 0;
    if (hasStock && current.averageCost.currency !== unitCost.currency) {
      throw new BusinessRuleError(
        `Currency mismatch: existing stock is valued in "${current.averageCost.currency}", movement uses "${unitCost.currency}". Multi-currency valuation is not supported.`,
        {
          code: 'STOCK_MOVEMENT.CURRENCY_MISMATCH',
          params: { existing: current.averageCost.currency, used: unitCost.currency },
        },
      );
    }

    const stockLotId = await this.resolveIncomingStockLotId(trx, params, warehouseId, unitCost);

    const previousQuantity = hasStock ? current.quantityOnHand : 0;
    const previousValue = hasStock ? current.averageCost.multiplyByQuantity(previousQuantity) : Money.zero(unitCost.currency);
    const incomingValue = unitCost.multiplyByQuantity(params.quantity);
    const newQuantity = previousQuantity + params.quantity;
    const newAverageCost = previousValue.add(incomingValue).divideByQuantity(newQuantity);

    await this.stockLevels.upsert(trx, {
      productVariantId: params.productVariantId,
      locationId: params.locationId,
      warehouseId,
      quantityOnHand: newQuantity,
      averageCost: newAverageCost,
    });

    return this.movements.create(trx, {
      productVariantId: params.productVariantId,
      locationId: params.locationId,
      warehouseId,
      movementType: params.movementType,
      quantity: params.quantity,
      unitCost,
      resultingAverageCost: newAverageCost,
      stockLotId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      createdBy: params.createdBy,
    });
  }

  /** Handles the lot/serial side-bookkeeping for an incoming movement; returns null for a non-tracked product. */
  private async resolveIncomingStockLotId(
    trx: Kysely<TenantDatabase>,
    params: IncomingParams,
    warehouseId: string,
    unitCost: Money,
  ): Promise<string | null> {
    if (params.product.trackingType === 'none') return null;

    if (params.product.trackingType === 'serial' && params.quantity !== 1) {
      throw new BusinessRuleError(
        'Serial-tracked products must be received exactly one unit (quantity = 1) per serial number.',
        { code: 'STOCK_MOVEMENT.SERIAL_RECEIVE_QTY_MUST_BE_ONE' },
      );
    }

    let stockLotId: string;
    if (params.movementType === 'transfer_in') {
      if (!params.lotId) {
        throw new BusinessRuleError(
          'Transferring a lot/serial-tracked product requires specifying which lot (lotId) to transfer.',
          { code: 'STOCK_MOVEMENT.TRANSFER_REQUIRES_LOT_ID' },
        );
      }
      stockLotId = params.lotId;
    } else {
      const trackingLabel = params.product.trackingType === 'serial' ? 'serial number' : 'lot number';
      const trackingLabelAr = params.product.trackingType === 'serial' ? 'رقم تسلسلي' : 'رقم دفعة';
      if (!params.lotNumber) {
        throw new BusinessRuleError(
          `This product is ${params.product.trackingType}-tracked: a ${trackingLabel} is required.`,
          { code: 'STOCK_MOVEMENT.TRACKING_LABEL_REQUIRED', params: { trackingLabel: trackingLabelAr } },
        );
      }
      const existingLot = await this.stockLots.findByVariantAndLotNumber(trx, params.productVariantId, params.lotNumber);
      if (
        existingLot &&
        params.product.trackingType === 'serial' &&
        (await this.stockLots.totalQuantityOnHand(trx, existingLot.id)) > 0
      ) {
        throw new BusinessRuleError(`Serial number "${params.lotNumber}" is already in stock.`, {
          code: 'STOCK_MOVEMENT.SERIAL_ALREADY_IN_STOCK',
          params: { serialNumber: params.lotNumber },
        });
      }
      const lot =
        existingLot ??
        (await this.stockLots.createLot(trx, {
          productVariantId: params.productVariantId,
          lotNumber: params.lotNumber,
          expiryDate: params.expiryDate ?? null,
          unitCost,
        }));
      stockLotId = lot.id;
    }

    const currentLotLevel = await this.stockLots.findLevel(trx, stockLotId, params.locationId);
    await this.stockLots.upsertLevel(trx, {
      stockLotId,
      locationId: params.locationId,
      warehouseId,
      quantityOnHand: (currentLotLevel?.quantityOnHand ?? 0) + params.quantity,
    });

    return stockLotId;
  }

  private async applyOutgoing(trx: Kysely<TenantDatabase>, params: OutgoingParams): Promise<StockMovement> {
    const warehouseId = await this.resolveWarehouseId(trx, params.locationId);
    const current = await this.stockLevels.findByVariantAndLocation(trx, params.productVariantId, params.locationId);
    if (!current || current.quantityOnHand < params.quantity) {
      const available = current?.quantityOnHand ?? 0;
      throw new BusinessRuleError(
        `Insufficient stock: requested ${params.quantity}, only ${available} available at this location.`,
        { code: 'STOCK_MOVEMENT.INSUFFICIENT_STOCK', params: { requested: params.quantity, available } },
      );
    }

    const { stockLotId, multiLotConsumptions } = await this.resolveOutgoingStockLotConsumption(trx, params, warehouseId);

    const newQuantity = current.quantityOnHand - params.quantity;

    await this.stockLevels.upsert(trx, {
      productVariantId: params.productVariantId,
      locationId: params.locationId,
      warehouseId,
      quantityOnHand: newQuantity,
      averageCost: current.averageCost,
    });

    const movement = await this.movements.create(trx, {
      productVariantId: params.productVariantId,
      locationId: params.locationId,
      warehouseId,
      movementType: params.movementType,
      quantity: params.quantity,
      unitCost: current.averageCost,
      resultingAverageCost: current.averageCost,
      stockLotId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      createdBy: params.createdBy,
    });

    for (const consumption of multiLotConsumptions) {
      await this.stockLots.createConsumption(trx, {
        stockMovementId: movement.id,
        stockLotId: consumption.stockLotId,
        quantity: consumption.quantity,
      });
    }

    return movement;
  }

  /**
   * Handles the lot/serial side-bookkeeping for an outgoing movement.
   * Returns the single lot to stamp on the movement row (or null for a
   * non-tracked product, or when the FIFO selection spanned more than one
   * lot — in which case `multiLotConsumptions` carries the breakdown for
   * the caller to persist once the movement row exists).
   */
  private async resolveOutgoingStockLotConsumption(
    trx: Kysely<TenantDatabase>,
    params: OutgoingParams,
    warehouseId: string,
  ): Promise<{ stockLotId: string | null; multiLotConsumptions: { stockLotId: string; quantity: number }[] }> {
    if (params.product.trackingType === 'none') return { stockLotId: null, multiLotConsumptions: [] };

    if (params.product.trackingType === 'serial' && params.quantity !== 1) {
      throw new BusinessRuleError(
        'Serial-tracked products must be issued exactly one unit (quantity = 1) per movement.',
        { code: 'STOCK_MOVEMENT.SERIAL_ISSUE_QTY_MUST_BE_ONE' },
      );
    }

    if (params.lotId) {
      const level = await this.stockLots.findLevel(trx, params.lotId, params.locationId);
      if (!level || level.quantityOnHand < params.quantity) {
        const available = level?.quantityOnHand ?? 0;
        throw new BusinessRuleError(
          `Insufficient stock in the selected lot: requested ${params.quantity}, only ${available} available at this location.`,
          { code: 'STOCK_MOVEMENT.INSUFFICIENT_LOT_STOCK', params: { requested: params.quantity, available } },
        );
      }
      await this.stockLots.upsertLevel(trx, {
        stockLotId: params.lotId,
        locationId: params.locationId,
        warehouseId,
        quantityOnHand: level.quantityOnHand - params.quantity,
      });
      return { stockLotId: params.lotId, multiLotConsumptions: [] };
    }

    const availableLots = await this.stockLots.listAvailableForFifo(trx, params.productVariantId, params.locationId);
    const totalAvailable = availableLots.reduce((sum, lot) => sum + lot.quantityAvailable, 0);
    if (totalAvailable < params.quantity) {
      throw new BusinessRuleError(
        `Insufficient lot-tracked stock: requested ${params.quantity}, only ${totalAvailable} available across all lots at this location.`,
        {
          code: 'STOCK_MOVEMENT.INSUFFICIENT_LOT_TRACKED_STOCK',
          params: { requested: params.quantity, available: totalAvailable },
        },
      );
    }

    let remaining = params.quantity;
    const consumed: { stockLotId: string; quantity: number }[] = [];
    for (const lot of availableLots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.quantityAvailable, remaining);
      await this.stockLots.upsertLevel(trx, {
        stockLotId: lot.stockLotId,
        locationId: params.locationId,
        warehouseId,
        quantityOnHand: lot.quantityAvailable - take,
      });
      consumed.push({ stockLotId: lot.stockLotId, quantity: take });
      remaining -= take;
    }

    if (consumed.length === 1) {
      return { stockLotId: consumed[0].stockLotId, multiLotConsumptions: [] };
    }
    return { stockLotId: null, multiLotConsumptions: consumed };
  }
}
