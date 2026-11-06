import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepository } from '../ports/stock-movement.repository';
import { STOCK_LEVEL_REPOSITORY, type StockLevelRepository } from '../ports/stock-level.repository';
import { StockMovementsService } from './stock-movements.service';
import { InventoryValuationEventsService } from './inventory-valuation-events.service';
import {
  INVENTORY_VALUATION_POSTED,
  type InventoryValuationSource,
} from '../../../../shared/events/inventory-valuation-event';
import type { PurchasePriceDifference } from '../../../../shared/events/purchase-price-difference';
import { moneyShare } from '../../domain/money-share';

/**
 * Corrects the cost of purchased goods once the supplier's document states
 * the real price (IAS 2 — cost is what was actually paid):
 *
 *  - Purchase invoice ≠ receipt cost (Purchases computes the difference per
 *    line): the share of the goods still on hand at each receiving location
 *    goes into that location's stock value (so the average cost moves); the
 *    share already sold goes to cost of goods sold. Both clear GRNI.
 *  - Debit note ≠ the returned goods' cost: the difference goes to cost of
 *    goods sold and clears GRNI.
 *  - Goods received after they were invoiced: the invoice's price part,
 *    applied when the receipt arrives (applyReceiptDifferences).
 *
 * Only the PRICE part of a difference is cost; the exchange part (receipt
 * rate vs invoice rate) is a gain / loss Accounting books (IAS 21).
 *
 * Valuation only — quantities never change. Same on-hand / sold split as
 * LandedCostsService. The journal entry reaches Accounting through the
 * outbox ('inventory.valuation.posted'); a redelivered event is detected by
 * that outbox row and applied once.
 */
@Injectable()
export class PurchaseCostCorrectionsService {
  private readonly logger = new Logger(PurchaseCostCorrectionsService.name);

  constructor(
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepository,
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevels: StockLevelRepository,
    private readonly stockMovements: StockMovementsService,
    private readonly valuationEvents: InventoryValuationEventsService,
  ) {}

  /** Runs inside the caller's transaction. */
  async applyInvoiceDifferences(
    trx: Kysely<TenantDatabase>,
    input: {
      schema: string;
      actorUserId: string | null;
      invoiceId: string;
      invoiceNumber: string | null;
      entryDate: string | null;
      differences: readonly PurchasePriceDifference[];
    },
  ): Promise<void> {
    if (input.differences.length === 0) return;
    if (await this.alreadyApplied(trx, 'purchase_invoice', input.invoiceId)) return;

    const variantIds = input.differences.map((d) => d.productVariantId);
    const stockItems = await this.stockMovements.stockItemVariantIds(trx, variantIds);
    const differences = input.differences.filter((d) => stockItems.has(d.productVariantId));
    if (differences.length === 0) return;
    await this.stockLevels.lockVariants(trx, variantIds);

    const currency = differences[0].amount.currency;
    let toInventory = Money.zero(currency);
    let toCogs = Money.zero(currency);
    for (const difference of differences) {
      const amount = Money.fromMinorUnits(BigInt(difference.amount.amountMinorUnits), difference.amount.currency);
      const result = await this.revalue(trx, difference, amount);
      toInventory = toInventory.add(result.toInventory);
      toCogs = toCogs.add(result.toCogs);
    }

    await this.valuationEvents.write(trx, {
      schema: input.schema,
      actorUserId: input.actorUserId,
      sourceType: 'purchase_invoice',
      sourceId: input.invoiceId,
      documentNumber: input.invoiceNumber,
      entryDate: input.entryDate,
      description: `فرق سعر الشراء — ${input.invoiceNumber ?? ''}`.trim(),
      entries: [
        { kind: 'price_difference_inventory', amount: toInventory },
        { kind: 'price_difference_cogs', amount: toCogs },
      ],
    });
  }

  /**
   * Invoice before receipt: the price part of goods a posted invoice billed
   * before they arrived, applied to the stock this receipt just brought in
   * (its movements must already be recorded in `trx`). Writes no event —
   * the receipt's own valuation entry carries the returned amounts
   * (Dr Inventory / COGS, Cr GRNI). Runs inside the caller's transaction,
   * after it locked the variants.
   */
  async applyReceiptDifferences(
    trx: Kysely<TenantDatabase>,
    differences: readonly PurchasePriceDifference[],
  ): Promise<{ toInventory: Money; toCogs: Money } | null> {
    const priced = differences.filter((d) => d.amount.amountMinorUnits !== '0');
    if (priced.length === 0) return null;
    const stockItems = await this.stockMovements.stockItemVariantIds(
      trx,
      priced.map((d) => d.productVariantId),
    );
    const applicable = priced.filter((d) => stockItems.has(d.productVariantId));
    if (applicable.length === 0) return null;

    const currency = applicable[0].amount.currency;
    let toInventory = Money.zero(currency);
    let toCogs = Money.zero(currency);
    for (const difference of applicable) {
      const amount = Money.fromMinorUnits(BigInt(difference.amount.amountMinorUnits), difference.amount.currency);
      const result = await this.revalue(trx, difference, amount);
      toInventory = toInventory.add(result.toInventory);
      toCogs = toCogs.add(result.toCogs);
    }
    return { toInventory, toCogs };
  }

  /**
   * Debit note for a purchase return: its value (tenant currency, per
   * variant and base quantity) vs what the returned goods left stock at.
   * Throws while the return's own stock movements aren't recorded yet, so
   * the outbox retries in order.
   */
  async applyReturnDifference(
    trx: Kysely<TenantDatabase>,
    input: {
      schema: string;
      actorUserId: string | null;
      debitNoteId: string;
      debitNoteNumber: string | null;
      purchaseReturnId: string;
      entryDate: string | null;
      lines: readonly { productVariantId: string; baseQuantity: number; value: Money }[];
    },
  ): Promise<void> {
    if (input.lines.length === 0) return;
    if (await this.alreadyApplied(trx, 'purchase_debit_note', input.debitNoteId)) return;
    const stockItems = await this.stockMovements.stockItemVariantIds(
      trx,
      input.lines.map((line) => line.productVariantId),
    );
    const lines = input.lines.filter((line) => stockItems.has(line.productVariantId));
    if (lines.length === 0) return;

    let difference = Money.zero(lines[0].value.currency);
    for (const line of lines) {
      const returned = await this.movements.sumForReference(
        trx,
        'purchase_return',
        input.purchaseReturnId,
        line.productVariantId,
      );
      if (!returned) {
        throw new Error(
          `Purchase return "${input.purchaseReturnId}" has no stock movements yet — debit note "${input.debitNoteId}" will retry.`,
        );
      }
      if (returned.currency !== line.value.currency) {
        this.logger.warn(`Debit note "${input.debitNoteId}": stock is valued in ${returned.currency} — no cost difference posted.`);
        return;
      }
      const cost = moneyShare(
        Money.fromMinorUnits(returned.totalCostMinorUnits, returned.currency),
        Math.min(line.baseQuantity, returned.quantity),
        returned.quantity,
      );
      difference = difference.add(line.value.subtract(cost));
    }

    await this.valuationEvents.write(trx, {
      schema: input.schema,
      actorUserId: input.actorUserId,
      sourceType: 'purchase_debit_note',
      sourceId: input.debitNoteId,
      documentNumber: input.debitNoteNumber,
      entryDate: input.entryDate,
      description: `فرق تكلفة مرتجع مشتريات — ${input.debitNoteNumber ?? ''}`.trim(),
      entries: [{ kind: 'return_price_difference', amount: difference }],
    });
  }

  /** Spreads one difference over the locations its receipts landed in; each location's on-hand share revalues stock, the rest is COGS. */
  private async revalue(
    trx: Kysely<TenantDatabase>,
    difference: PurchasePriceDifference,
    amount: Money,
  ): Promise<{ toInventory: Money; toCogs: Money }> {
    const zero = Money.zero(amount.currency);
    const locations = await this.movements.quantityByLocationForReferences(
      trx,
      'goods_receipt',
      difference.goodsReceiptIds,
      difference.productVariantId,
    );
    const receivedTotal = locations.reduce((sum, location) => sum + location.quantity, 0);
    if (receivedTotal <= 0) return { toInventory: zero, toCogs: amount };

    let toInventory = zero;
    let left = amount;
    for (const [index, location] of locations.entries()) {
      const share = index === locations.length - 1 ? left : moneyShare(amount, location.quantity, receivedTotal);
      left = left.subtract(share);
      const matchedHere = (difference.matchedBaseQuantity * location.quantity) / receivedTotal;

      const current = await this.stockLevels.findByVariantAndLocation(
        trx,
        difference.productVariantId,
        location.locationId,
      );
      const onHand = current ? Math.max(current.quantityOnHand, 0) : 0;
      if (!current || onHand <= 0 || current.inventoryValue.currency !== amount.currency) continue;

      let inStock = onHand >= matchedHere ? share : moneyShare(share, onHand, matchedHere);
      // A cheaper invoice can't take the stock value below zero; the rest is cost of goods sold.
      if (current.inventoryValue.add(inStock).isNegative()) inStock = zero.subtract(current.inventoryValue);
      if (inStock.isZero()) continue;

      const inventoryValue = current.inventoryValue.add(inStock);
      await this.stockLevels.upsert(trx, {
        productVariantId: difference.productVariantId,
        locationId: location.locationId,
        warehouseId: current.warehouseId,
        quantityOnHand: current.quantityOnHand,
        averageCost: inventoryValue.divideByQuantity(current.quantityOnHand),
        inventoryValue,
      });
      toInventory = toInventory.add(inStock);
    }
    return { toInventory, toCogs: amount.subtract(toInventory) };
  }

  /** True when this document's valuation event was already written (a redelivered outbox event). */
  private async alreadyApplied(
    trx: Kysely<TenantDatabase>,
    sourceType: InventoryValuationSource,
    sourceId: string,
  ): Promise<boolean> {
    const row = await trx
      .selectFrom('outbox_events')
      .select('id')
      .where('event_type', '=', INVENTORY_VALUATION_POSTED)
      .where(sql<boolean>`payload->>'entityType' = ${sourceType} AND payload->>'entityId' = ${sourceId}`)
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  }
}
