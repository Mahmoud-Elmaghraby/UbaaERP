import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

export interface SalePriceFloor {
  productVariantId: string;
  productName: string;
  /** Per base unit, minor units; null when unknown (no stock and no purchase price). */
  costMinor: bigint | null;
  costCurrency: string | null;
  /** products.min_sale_price_* (migration 0120), per base unit; null = none. */
  minMinor: bigint | null;
  minCurrency: string | null;
}

/**
 * Read-only: the price floors of these product variants, for the sales price checks
 * ('sales.belowCostMode' / 'sales.belowMinPriceMode'). Same read-only catalogue precedent as
 * ProductUnitResolver and stockItemVariantIds — no Inventory behaviour is triggered.
 *
 * Cost = the weighted average cost of the stock on hand across warehouses (inventory value ÷
 * quantity), or, with nothing on hand, the variant's / product's purchase price. Services have no
 * cost.
 */
export async function salePriceFloors(
  db: Kysely<TenantDatabase>,
  productVariantIds: readonly string[],
): Promise<Map<string, SalePriceFloor>> {
  const ids = [...new Set(productVariantIds)];
  const out = new Map<string, SalePriceFloor>();
  if (ids.length === 0) return out;
  const rows = await db
    .selectFrom('product_variants as v')
    .innerJoin('products as p', 'p.id', 'v.product_id')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('stock_levels')
          .select([
            'product_variant_id',
            'average_cost_currency',
            sql<string>`SUM(inventory_value_amount)`.as('value'),
            sql<string>`SUM(quantity_on_hand)`.as('qty'),
          ])
          .where('quantity_on_hand', '>', '0')
          .where('product_variant_id', 'in', ids)
          .groupBy(['product_variant_id', 'average_cost_currency'])
          .as('s'),
      (join) => join.onRef('s.product_variant_id', '=', 'v.id'),
    )
    .select([
      'v.id as id',
      'p.name as name',
      'p.item_type as itemType',
      's.value as stockValue',
      's.qty as stockQty',
      's.average_cost_currency as stockCurrency',
      sql<string | null>`COALESCE(v.purchase_price_amount, p.purchase_price_amount)`.as('purchaseAmount'),
      sql<string | null>`COALESCE(v.purchase_price_currency, p.purchase_price_currency)`.as('purchaseCurrency'),
      'p.min_sale_price_amount as minAmount',
      'p.min_sale_price_currency as minCurrency',
    ])
    .where('v.id', 'in', ids)
    .execute();

  for (const row of rows) {
    // Two stock currencies for one variant can't be averaged — the first row wins (rare: a currency reset).
    if (out.has(row.id)) continue;
    let costMinor: bigint | null = null;
    let costCurrency: string | null = null;
    if (row.itemType !== 'service') {
      const qty = row.stockQty === null ? 0 : Number(row.stockQty);
      if (qty > 0 && row.stockValue !== null) {
        costMinor = BigInt(Math.round(Number(row.stockValue) / qty));
        costCurrency = row.stockCurrency;
      } else if (row.purchaseAmount !== null) {
        costMinor = BigInt(row.purchaseAmount);
        costCurrency = row.purchaseCurrency;
      }
    }
    out.set(row.id, {
      productVariantId: row.id,
      productName: row.name,
      costMinor,
      costCurrency,
      minMinor: row.minAmount === null ? null : BigInt(row.minAmount),
      minCurrency: row.minCurrency,
    });
  }
  return out;
}
