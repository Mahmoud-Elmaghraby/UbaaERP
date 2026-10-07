import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

export interface StockNeedLine {
  productVariantId: string;
  /** In the product's base unit. */
  quantity: number;
  /** Specific lots picked (base-unit quantities); empty/absent = any lot (FEFO). */
  lots?: { lotNumber: string; quantity: number }[];
}

interface Shortage {
  name: string;
  requested: number;
  available: number;
  lotNumber?: string;
  reason: 'insufficient' | 'lot_missing' | 'lot_expired';
}

const EPSILON = 1e-6;
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Up-front stock check for documents that take stock out (deliveries —
 * incl. POS and invoices that deliver — and purchase returns), run inside
 * the confirming transaction so the user gets a clear refusal on the spot
 * instead of a confirmed document whose stock movement later fails in the
 * background (inventory audit 2026-10, step 1 follow-up).
 *
 * A plain read of Inventory's stock tables at the warehouse's DEFAULT
 * location — the location the Inventory listeners move stock at. It does
 * not move stock and does not replace Inventory's own check: the listener
 * stays the authority (two documents confirmed at the same instant can
 * still both pass here; the second then fails in the listener, visibly).
 */
@Injectable()
export class StockAvailabilityChecker {
  async assertAvailable(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    lines: readonly StockNeedLine[],
    options: { blockExpired: boolean; errorCode: string; locationId?: string },
  ): Promise<void> {
    const shortages = await this.findShortages(db, warehouseId, lines, options.blockExpired, options.locationId);
    if (shortages.length === 0) return;
    const details = shortages
      .map((shortage) => {
        if (shortage.reason === 'lot_missing')
          return `"${shortage.name}": الدفعة ${shortage.lotNumber} غير موجودة في المخزن`;
        if (shortage.reason === 'lot_expired')
          return `"${shortage.name}": الدفعة ${shortage.lotNumber} منتهية الصلاحية`;
        return `"${shortage.name}"${shortage.lotNumber ? ` (دفعة ${shortage.lotNumber})` : ''}: المطلوب ${shortage.requested}، المتاح ${shortage.available}`;
      })
      .join('؛ ');
    throw new BusinessRuleError(`Not enough stock: ${JSON.stringify(shortages)}`, {
      code: options.errorCode,
      params: { details },
    });
  }

  async findShortages(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    lines: readonly StockNeedLine[],
    blockExpired: boolean,
    /** A specific location of the warehouse; default = its DEFAULT location. */
    locationId?: string,
  ): Promise<Shortage[]> {
    const variantIds = [...new Set(lines.map((line) => line.productVariantId))];
    if (variantIds.length === 0) return [];

    const location = locationId
      ? { id: locationId }
      : await db
          .selectFrom('warehouse_locations')
          .select('id')
          .where('warehouse_id', '=', warehouseId)
          .where('code', '=', 'DEFAULT')
          .executeTakeFirst();
    if (!location) return []; // Inventory reports the missing location itself.

    const products = await db
      .selectFrom('product_variants')
      .innerJoin('products', 'products.id', 'product_variants.product_id')
      .select([
        'product_variants.id as id',
        'products.name as name',
        'products.item_type as item_type',
        'products.tracking_type as tracking_type',
      ])
      .where('product_variants.id', 'in', variantIds)
      .execute();
    const productById = new Map(products.map((row) => [row.id, row]));

    const levels = await db
      .selectFrom('stock_levels')
      .select(['product_variant_id', 'quantity_on_hand'])
      .where('location_id', '=', location.id)
      .where('product_variant_id', 'in', variantIds)
      .execute();
    const onHand = new Map(levels.map((row) => [row.product_variant_id, Number(row.quantity_on_hand)]));

    const lotRows = await db
      .selectFrom('stock_lots')
      .leftJoin('stock_lot_levels', (join) =>
        join
          .onRef('stock_lot_levels.stock_lot_id', '=', 'stock_lots.id')
          .on('stock_lot_levels.location_id', '=', location.id),
      )
      .select([
        'stock_lots.product_variant_id as variant_id',
        'stock_lots.lot_number as lot_number',
        sql<boolean>`stock_lots.expiry_date IS NOT NULL AND stock_lots.expiry_date < CURRENT_DATE`.as('expired'),
        sql<string>`COALESCE(stock_lot_levels.quantity_on_hand, 0)`.as('quantity'),
      ])
      .where('stock_lots.product_variant_id', 'in', variantIds)
      .execute();

    const needByVariant = new Map<string, number>();
    const needByLot = new Map<string, { variantId: string; lotNumber: string; quantity: number }>();
    for (const line of lines) {
      needByVariant.set(line.productVariantId, (needByVariant.get(line.productVariantId) ?? 0) + line.quantity);
      for (const lot of line.lots ?? []) {
        const key = `${line.productVariantId}|${lot.lotNumber}`;
        const entry = needByLot.get(key) ?? { variantId: line.productVariantId, lotNumber: lot.lotNumber, quantity: 0 };
        entry.quantity += lot.quantity;
        needByLot.set(key, entry);
      }
    }

    const shortages: Shortage[] = [];
    for (const [variantId, need] of needByVariant) {
      const product = productById.get(variantId);
      if (!product || product.item_type === 'service') continue;
      const name = product.name;
      if (product.tracking_type === 'none') {
        const available = onHand.get(variantId) ?? 0;
        if (available + EPSILON < need)
          shortages.push({ name, requested: round(need), available: round(available), reason: 'insufficient' });
        continue;
      }
      const variantLots = lotRows.filter((row) => row.variant_id === variantId);
      const usable = variantLots
        .filter((row) => !(blockExpired && row.expired))
        .reduce((sum, row) => sum + Number(row.quantity), 0);
      if (usable + EPSILON < need) {
        shortages.push({ name, requested: round(need), available: round(usable), reason: 'insufficient' });
        continue;
      }
      for (const picked of needByLot.values()) {
        if (picked.variantId !== variantId) continue;
        const lot = variantLots.find((row) => row.lot_number === picked.lotNumber);
        if (!lot) {
          shortages.push({
            name,
            requested: picked.quantity,
            available: 0,
            lotNumber: picked.lotNumber,
            reason: 'lot_missing',
          });
        } else if (blockExpired && lot.expired) {
          shortages.push({
            name,
            requested: picked.quantity,
            available: 0,
            lotNumber: picked.lotNumber,
            reason: 'lot_expired',
          });
        } else if (Number(lot.quantity) + EPSILON < picked.quantity) {
          shortages.push({
            name,
            requested: round(picked.quantity),
            available: round(Number(lot.quantity)),
            lotNumber: picked.lotNumber,
            reason: 'insufficient',
          });
        }
      }
    }
    return shortages;
  }
}
