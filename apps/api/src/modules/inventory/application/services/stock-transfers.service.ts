import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { ProductUnitResolver } from '../../../../shared/catalog/product-unit-resolver';
import { StockAvailabilityChecker } from '../../../../shared/catalog/stock-availability-checker';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { STOCK_TRANSFER_REPOSITORY, type StockTransferRepository } from '../ports/stock-transfer.repository';
import { WAREHOUSE_REPOSITORY, type WarehouseRepository } from '../ports/warehouse.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../ports/warehouse-location.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import {
  baseQuantity,
  splitReceipt,
  type CreateStockTransferInput,
  type DispatchedPiece,
  type ReceiveStockTransferInput,
  type StockTransfer,
  type StockTransferLine,
  type StockTransferLineInput,
  type StockTransferStatus,
  type StockTransferWithLines,
} from '../../domain/stock-transfer.entity';
import { BusinessRuleError } from '../errors';
import { StockMovementsService } from './stock-movements.service';
import { InventoryValuationEventsService, localIsoDate } from './inventory-valuation-events.service';

const REFERENCE_TYPE = 'stock_transfer';
const MAX_LINES = 1000;

interface ActorContext {
  schema: string;
  userId: string | null;
}

/**
 * Warehouse transfer document (migration 0083). Every state change runs in
 * one transaction holding a row lock on the transfer, so a double click can
 * never dispatch or receive twice.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    @Inject(STOCK_TRANSFER_REPOSITORY) private readonly transfers: StockTransferRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouses: WarehouseRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly stockMovements: StockMovementsService,
    private readonly numbering: NumberingSequencesService,
    private readonly units: ProductUnitResolver,
    private readonly availability: StockAvailabilityChecker,
    private readonly valuationEvents: InventoryValuationEventsService,
  ) {}

  list(
    db: Kysely<TenantDatabase>,
    filter: { status?: StockTransferStatus; warehouseId?: string } = {},
  ): Promise<StockTransfer[]> {
    return this.transfers.list(db, filter);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<StockTransferWithLines> {
    const transfer = await this.transfers.findById(db, id);
    if (!transfer) throw entityNotFound('STOCK_TRANSFER', id);
    return { ...transfer, lines: await this.transfers.listLines(db, id) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateStockTransferInput,
    createdBy: string | null,
  ): Promise<StockTransferWithLines> {
    const route = await this.resolveRoute(db, input);
    const lines = await this.prepareLines(db, input.lines);
    const id = await withTransaction(db, async (trx) => {
      await this.numbering.ensureTenantWide(trx, 'stock_transfer', { prefix: 'TRF-', paddingLength: 5 });
      const allocated = await this.numbering.allocateNext(trx, 'stock_transfer', null);
      const transfer = await this.transfers.create(trx, {
        transferNumber: allocated.formatted,
        ...route,
        // The app's calendar day, not the DB server's CURRENT_DATE (UTC around midnight in Cairo).
        transferDate: input.transferDate ?? localIsoDate(),
        notes: input.notes ?? null,
        createdBy,
      });
      await this.transfers.replaceLines(trx, transfer.id, lines);
      return transfer.id;
    });
    return this.getById(db, id);
  }

  /** Replaces header fields and (when given) every line of a draft. */
  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<CreateStockTransferInput>,
  ): Promise<StockTransferWithLines> {
    const current = await this.draft(db, id);
    const route = await this.resolveRoute(db, {
      fromWarehouseId: input.fromWarehouseId ?? current.fromWarehouseId,
      fromLocationId:
        input.fromLocationId !== undefined
          ? input.fromLocationId
          : input.fromWarehouseId && input.fromWarehouseId !== current.fromWarehouseId
            ? null
            : current.fromLocationId,
      toWarehouseId: input.toWarehouseId ?? current.toWarehouseId,
      toLocationId:
        input.toLocationId !== undefined
          ? input.toLocationId
          : input.toWarehouseId && input.toWarehouseId !== current.toWarehouseId
            ? null
            : current.toLocationId,
    });
    const lines = input.lines ? await this.prepareLines(db, input.lines) : null;
    await withTransaction(db, async (trx) => {
      await this.transfers.lockForUpdate(trx, id);
      await this.draft(trx, id);
      await this.transfers.updateHeader(trx, id, {
        ...route,
        ...(input.transferDate ? { transferDate: input.transferDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      });
      if (lines) await this.transfers.replaceLines(trx, id, lines);
    });
    return this.getById(db, id);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.draft(db, id);
    await this.transfers.delete(db, id);
  }

  /** Goods leave the source: draft → in_transit. */
  async dispatch(db: Kysely<TenantDatabase>, id: string, actor: ActorContext): Promise<StockTransferWithLines> {
    await withTransaction(db, async (trx) => {
      await this.transfers.lockForUpdate(trx, id);
      const transfer = await this.draft(trx, id);
      await this.dispatchLines(trx, transfer, actor);
      await this.transfers.setStatus(trx, id, 'in_transit', { userId: actor.userId, step: 'dispatched' });
    });
    return this.getById(db, id);
  }

  /**
   * Goods arrive: in_transit → received. Lines not listed arrive in full;
   * a listed line may arrive short — the missing value is written off.
   */
  async receive(
    db: Kysely<TenantDatabase>,
    id: string,
    input: ReceiveStockTransferInput,
    actor: ActorContext,
  ): Promise<StockTransferWithLines> {
    await withTransaction(db, async (trx) => {
      await this.transfers.lockForUpdate(trx, id);
      const transfer = await this.inStatus(trx, id, 'in_transit');
      await this.receiveLines(trx, transfer, input, actor);
      await this.transfers.setStatus(trx, id, 'received', { userId: actor.userId, step: 'received' });
    });
    return this.getById(db, id);
  }

  /** Same-day move: dispatch and receive everything in one step (draft → received). */
  async post(db: Kysely<TenantDatabase>, id: string, actor: ActorContext): Promise<StockTransferWithLines> {
    await withTransaction(db, async (trx) => {
      await this.transfers.lockForUpdate(trx, id);
      const transfer = await this.draft(trx, id);
      await this.dispatchLines(trx, transfer, actor);
      await this.transfers.setStatus(trx, id, 'in_transit', { userId: actor.userId, step: 'dispatched' });
      await this.receiveLines(trx, transfer, {}, actor);
      await this.transfers.setStatus(trx, id, 'received', { userId: actor.userId, step: 'received' });
    });
    return this.getById(db, id);
  }

  /**
   * Draft → cancelled. In transit → cancelled puts every dispatched piece
   * back at the source location at the value it left with.
   */
  async cancel(db: Kysely<TenantDatabase>, id: string, actor: ActorContext): Promise<StockTransferWithLines> {
    await withTransaction(db, async (trx) => {
      await this.transfers.lockForUpdate(trx, id);
      const transfer = await this.transfers.findById(trx, id);
      if (!transfer) throw entityNotFound('STOCK_TRANSFER', id);
      if (transfer.status === 'in_transit') {
        const lines = await this.transfers.listLines(trx, id);
        await this.stockMovements.lockVariants(
          trx,
          lines.map((line) => line.productVariantId),
        );
        for (const line of lines) {
          for (const piece of line.dispatched) {
            await this.stockMovements.recordTransferLeg(trx, {
              direction: 'in',
              productVariantId: line.productVariantId,
              locationId: transfer.fromLocationId,
              quantity: piece.quantity,
              lotId: piece.stockLotId,
              totalCost: this.pieceValue(line, piece),
              referenceType: REFERENCE_TYPE,
              referenceId: id,
              notes: `${transfer.transferNumber} — إلغاء`,
              createdBy: actor.userId,
            });
          }
        }
      } else if (transfer.status !== 'draft') {
        throw this.wrongStatus(transfer, 'draft');
      }
      await this.transfers.setStatus(trx, id, 'cancelled', { userId: actor.userId, step: 'cancelled' });
    });
    return this.getById(db, id);
  }

  /** Value of goods dispatched but not yet received, per destination warehouse (valuation report). */
  inTransitValue(db: Kysely<TenantDatabase>) {
    return this.transfers.inTransitValue(db);
  }

  private async dispatchLines(
    trx: Kysely<TenantDatabase>,
    transfer: StockTransfer,
    actor: ActorContext,
  ): Promise<void> {
    const lines = await this.transfers.listLines(trx, transfer.id);
    if (lines.length === 0) {
      throw new BusinessRuleError('The transfer has no lines.', { code: 'STOCK_TRANSFER.NO_LINES' });
    }
    await this.assertActiveRoute(trx, transfer);
    await this.stockMovements.lockVariants(
      trx,
      lines.map((line) => line.productVariantId),
    );
    // One clear message listing every short item, before any movement is attempted.
    await this.availability.assertAvailable(
      trx,
      transfer.fromWarehouseId,
      lines.map((line) => ({
        productVariantId: line.productVariantId,
        quantity: baseQuantity(line),
        lots: line.lots.map((lot) => ({ lotNumber: lot.lotNumber, quantity: lot.quantity * line.unitFactor })),
      })),
      { blockExpired: false, errorCode: 'STOCK_TRANSFER.INSUFFICIENT_STOCK', locationId: transfer.fromLocationId },
    );

    for (const line of lines) {
      const quantity = baseQuantity(line);
      const plan = await this.stockMovements.planOutgoingLots(trx, {
        productVariantId: line.productVariantId,
        locationId: transfer.fromLocationId,
        quantity,
        requested: line.lots.map((lot) => ({ lotNumber: lot.lotNumber, quantity: lot.quantity * line.unitFactor })),
        blockExpired: false,
      });
      const pieces: DispatchedPiece[] = [];
      let total: Money | null = null;
      for (const piece of plan ?? [{ lotId: null as string | null, quantity }]) {
        const movement = await this.stockMovements.recordTransferLeg(trx, {
          direction: 'out',
          productVariantId: line.productVariantId,
          locationId: transfer.fromLocationId,
          quantity: piece.quantity,
          lotId: piece.lotId,
          referenceType: REFERENCE_TYPE,
          referenceId: transfer.id,
          notes: transfer.transferNumber,
          createdBy: actor.userId,
        });
        const value = movement.totalCost ?? Money.zero(movement.resultingAverageCost.currency);
        total = total ? total.add(value) : value;
        pieces.push({
          stockLotId: piece.lotId,
          quantity: piece.quantity,
          valueMinorUnits: value.toMinorUnits().toString(),
        });
      }
      await this.transfers.setDispatched(
        trx,
        line.id,
        pieces,
        total ? { amountMinorUnits: total.toMinorUnits().toString(), currency: total.currency } : null,
      );
    }
  }

  private async receiveLines(
    trx: Kysely<TenantDatabase>,
    transfer: StockTransfer,
    input: ReceiveStockTransferInput,
    actor: ActorContext,
  ): Promise<void> {
    const lines = await this.transfers.listLines(trx, transfer.id);
    const requested = new Map((input.lines ?? []).map((line) => [line.lineId, line.receivedQuantity]));
    for (const lineId of requested.keys()) {
      if (!lines.some((line) => line.id === lineId)) throw entityNotFound('STOCK_TRANSFER_LINE', lineId);
    }
    await this.stockMovements.lockVariants(
      trx,
      lines.map((line) => line.productVariantId),
    );

    let shortageValue: Money | null = null;
    for (const line of lines) {
      const dispatchedQuantity = line.dispatched.reduce((sum, piece) => sum + piece.quantity, 0);
      const received = requested.get(line.id) ?? dispatchedQuantity;
      if (!Number.isFinite(received) || received < 0 || received > dispatchedQuantity + 1e-9) {
        throw new BusinessRuleError('Received quantity must be between 0 and the dispatched quantity.', {
          code: 'STOCK_TRANSFER.RECEIVED_QUANTITY_INVALID',
          params: { dispatched: dispatchedQuantity },
        });
      }
      const { arriving, short } = splitReceipt(line.dispatched, received);
      for (const piece of arriving) {
        await this.stockMovements.recordTransferLeg(trx, {
          direction: 'in',
          productVariantId: line.productVariantId,
          locationId: transfer.toLocationId,
          quantity: piece.quantity,
          lotId: piece.stockLotId,
          totalCost: this.pieceValue(line, piece),
          referenceType: REFERENCE_TYPE,
          referenceId: transfer.id,
          notes: transfer.transferNumber,
          createdBy: actor.userId,
        });
      }
      for (const piece of short) {
        const value = this.pieceValue(line, piece);
        shortageValue = shortageValue ? shortageValue.add(value) : value;
      }
      await this.transfers.setReceivedQuantity(trx, line.id, received);
    }

    if (shortageValue && !shortageValue.isZero()) {
      await this.valuationEvents.write(trx, {
        schema: actor.schema,
        actorUserId: actor.userId,
        sourceType: 'stock_transfer',
        sourceId: transfer.id,
        documentNumber: transfer.transferNumber,
        description: `عجز في استلام التحويل ${transfer.transferNumber}`,
        entries: [{ kind: 'adjustment_loss', amount: shortageValue }],
      });
    }
  }

  private pieceValue(line: StockTransferLine, piece: DispatchedPiece): Money {
    const currency = line.dispatchedValue?.currency;
    if (!currency) {
      throw new BusinessRuleError('The transfer line has no dispatched value.', {
        code: 'STOCK_TRANSFER.NOT_DISPATCHED',
      });
    }
    return Money.fromMinorUnits(BigInt(piece.valueMinorUnits), currency);
  }

  private async prepareLines(db: Kysely<TenantDatabase>, lines: StockTransferLineInput[]) {
    if (lines.length === 0) {
      throw new BusinessRuleError('The transfer has no lines.', { code: 'STOCK_TRANSFER.NO_LINES' });
    }
    if (lines.length > MAX_LINES) {
      throw new BusinessRuleError(`At most ${MAX_LINES} lines.`, {
        code: 'STOCK_TRANSFER.TOO_MANY_LINES',
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
        throw new BusinessRuleError('Stock transfer quantity must be a positive number.', {
          code: 'STOCK_MOVEMENT.TRANSFER_QUANTITY_MUST_BE_POSITIVE',
        });
      }
      const tracking = await this.stockMovements.trackingTypeOf(db, line.productVariantId);
      const lots = (line.lots ?? [])
        .map((lot) => ({ lotNumber: lot.lotNumber.trim(), quantity: lot.quantity }))
        .filter((lot) => lot.lotNumber && lot.quantity > 0);
      if (tracking === 'none' && lots.length > 0) {
        throw new BusinessRuleError('This item is not lot/serial-tracked, so its line must not carry lots.', {
          code: 'STOCK_MOVEMENT.LOTS_NOT_TRACKED',
          params: { name: '' },
        });
      }
      if (lots.length > 0) {
        const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
        if (Math.abs(total - line.quantity) > 1e-6) {
          throw new BusinessRuleError('The chosen lots do not add up to the line quantity.', {
            code: 'STOCK_MOVEMENT.LOTS_QUANTITY_MISMATCH',
            params: { name: '', total, quantity: line.quantity },
          });
        }
      }
      result.push({
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        unitOfMeasureId: line.unitOfMeasureId,
        unitFactor: line.unitFactor,
        lots,
        notes: line.notes ?? null,
      });
    }
    return result;
  }

  private async resolveRoute(
    db: Kysely<TenantDatabase>,
    input: Pick<CreateStockTransferInput, 'fromWarehouseId' | 'fromLocationId' | 'toWarehouseId' | 'toLocationId'>,
  ): Promise<{ fromWarehouseId: string; fromLocationId: string; toWarehouseId: string; toLocationId: string }> {
    const fromLocationId = await this.locationOf(db, input.fromWarehouseId, input.fromLocationId);
    const toLocationId = await this.locationOf(db, input.toWarehouseId, input.toLocationId);
    if (fromLocationId === toLocationId) {
      throw new BusinessRuleError('Cannot transfer stock to the same location.', {
        code: 'STOCK_MOVEMENT.TRANSFER_SAME_LOCATION',
      });
    }
    return { fromWarehouseId: input.fromWarehouseId, fromLocationId, toWarehouseId: input.toWarehouseId, toLocationId };
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

  private async assertActiveRoute(db: Kysely<TenantDatabase>, transfer: StockTransfer): Promise<void> {
    for (const warehouseId of [transfer.fromWarehouseId, transfer.toWarehouseId]) {
      const warehouse = await this.warehouses.findById(db, warehouseId);
      if (warehouse && !warehouse.isActive) {
        throw new BusinessRuleError(`Warehouse "${warehouse.name}" is inactive.`, {
          code: 'STOCK_TRANSFER.WAREHOUSE_INACTIVE',
          params: { name: warehouse.name },
        });
      }
    }
  }

  private async draft(db: Kysely<TenantDatabase>, id: string): Promise<StockTransfer> {
    return this.inStatus(db, id, 'draft');
  }

  private async inStatus(db: Kysely<TenantDatabase>, id: string, status: StockTransferStatus): Promise<StockTransfer> {
    const transfer = await this.transfers.findById(db, id);
    if (!transfer) throw entityNotFound('STOCK_TRANSFER', id);
    if (transfer.status !== status) throw this.wrongStatus(transfer, status);
    return transfer;
  }

  private wrongStatus(transfer: StockTransfer, expected: StockTransferStatus): BusinessRuleError {
    return new BusinessRuleError(
      `Transfer "${transfer.transferNumber}" is ${transfer.status}; this action needs it to be ${expected}.`,
      {
        code: 'STOCK_TRANSFER.WRONG_STATUS',
        params: { number: transfer.transferNumber, status: transfer.status, expected },
      },
    );
  }
}
