import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  InventoryReportsRepository,
  ItemCardMovementRow,
  LowStockRow,
  ValuationRow,
} from '../../application/ports/inventory-reports.repository';

const SIGNED_QUANTITY = sql<string>`CASE WHEN m.movement_type IN ('in', 'transfer_in', 'adjustment_increase') THEN m.quantity ELSE -m.quantity END`;

/**
 * Read-only report queries. The item card resolves the source document's
 * number by reference type with plain reads of the documents' own tables —
 * reporting, not behaviour, so it doesn't cross the event-bus rule (§2.6).
 */
export class KyselyInventoryReportsRepository implements InventoryReportsRepository {
  async quantityBefore(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    warehouseId: string | null,
    from: Date,
  ): Promise<number> {
    const result = await sql<{ total: string | null }>`
      SELECT SUM(${SIGNED_QUANTITY}) AS total
        FROM stock_movements m
       WHERE m.product_variant_id = ${productVariantId}
         AND m.created_at < ${from}
         ${warehouseId ? sql`AND m.warehouse_id = ${warehouseId}` : sql``}
    `.execute(db);
    return Number(result.rows[0]?.total ?? 0);
  }

  async itemCardMovements(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    filter: { warehouseId: string | null; from: Date | null; to: Date | null; limit: number },
  ): Promise<ItemCardMovementRow[]> {
    const result = await sql<{
      id: string;
      created_at: Date;
      warehouse_id: string;
      movement_type: string;
      quantity: string;
      unit_cost_amount: string | null;
      unit_cost_currency: string | null;
      reference_type: string | null;
      reference_id: string | null;
      reference_number: string | null;
      lot_number: string | null;
      notes: string | null;
    }>`
      SELECT m.id, m.created_at, m.warehouse_id, m.movement_type, ${SIGNED_QUANTITY} AS quantity,
             COALESCE(m.unit_cost_amount, m.resulting_average_cost_amount) AS unit_cost_amount,
             COALESCE(m.unit_cost_currency, m.resulting_average_cost_currency) AS unit_cost_currency,
             m.reference_type, m.reference_id, m.notes, l.lot_number,
             CASE m.reference_type
               WHEN 'goods_receipt' THEN (SELECT receipt_number FROM goods_receipts WHERE id = m.reference_id)
               WHEN 'delivery' THEN (SELECT delivery_number FROM deliveries WHERE id = m.reference_id)
               WHEN 'purchase_return' THEN (SELECT return_number FROM purchase_returns WHERE id = m.reference_id)
               WHEN 'sales_return' THEN (SELECT return_number FROM sales_returns WHERE id = m.reference_id)
               WHEN 'stock_count' THEN (SELECT count_number FROM stock_counts WHERE id = m.reference_id)
               WHEN 'opening_balance' THEN (SELECT count_number FROM stock_counts WHERE id = m.reference_id)
               ELSE NULL
             END AS reference_number
        FROM stock_movements m
        LEFT JOIN stock_lots l ON l.id = m.stock_lot_id
       WHERE m.product_variant_id = ${productVariantId}
         ${filter.warehouseId ? sql`AND m.warehouse_id = ${filter.warehouseId}` : sql``}
         ${filter.from ? sql`AND m.created_at >= ${filter.from}` : sql``}
         ${filter.to ? sql`AND m.created_at < ${filter.to}` : sql``}
       ORDER BY m.created_at, m.id
       LIMIT ${filter.limit}
    `.execute(db);
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      warehouseId: row.warehouse_id,
      movementType: row.movement_type,
      quantity: Number(row.quantity),
      unitCost:
        row.unit_cost_amount !== null && row.unit_cost_currency !== null
          ? { amountMinorUnits: String(row.unit_cost_amount), currency: row.unit_cost_currency }
          : null,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      referenceNumber: row.reference_number,
      lotNumber: row.lot_number,
      notes: row.notes,
    }));
  }

  async valuation(db: Kysely<TenantDatabase>, warehouseId: string | null): Promise<ValuationRow[]> {
    const result = await sql<{
      product_variant_id: string;
      product_name: string;
      product_code: string;
      sku: string;
      category_id: string | null;
      warehouse_id: string;
      warehouse_name: string;
      quantity: string;
      value: string;
      currency: string;
    }>`
      SELECT sl.product_variant_id, p.name AS product_name, p.code AS product_code, v.sku, p.category_id,
             w.id AS warehouse_id, w.name AS warehouse_name,
             SUM(sl.quantity_on_hand) AS quantity,
             ROUND(SUM(sl.quantity_on_hand * sl.average_cost_amount))::bigint AS value,
             sl.average_cost_currency AS currency
        FROM stock_levels sl
        JOIN product_variants v ON v.id = sl.product_variant_id
        JOIN products p ON p.id = v.product_id
        JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE sl.quantity_on_hand <> 0
         ${warehouseId ? sql`AND sl.warehouse_id = ${warehouseId}` : sql``}
       GROUP BY sl.product_variant_id, p.name, p.code, v.sku, p.category_id, w.id, w.name, sl.average_cost_currency
       ORDER BY p.name, v.sku, w.name
    `.execute(db);
    return result.rows.map((row) => ({
      productVariantId: row.product_variant_id,
      productName: row.product_name,
      productCode: row.product_code,
      sku: row.sku,
      categoryId: row.category_id,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      quantity: Number(row.quantity),
      valueMinorUnits: String(row.value),
      currency: row.currency,
    }));
  }

  async lowStock(db: Kysely<TenantDatabase>, warehouseId: string | null): Promise<LowStockRow[]> {
    const result = await sql<{
      product_variant_id: string;
      product_name: string;
      product_code: string;
      sku: string;
      warehouse_id: string;
      warehouse_name: string;
      location_id: string;
      quantity: string;
      reorder_point: string;
    }>`
      SELECT sl.product_variant_id, p.name AS product_name, p.code AS product_code, v.sku,
             w.id AS warehouse_id, w.name AS warehouse_name, sl.location_id,
             sl.quantity_on_hand AS quantity, sl.reorder_point
        FROM stock_levels sl
        JOIN product_variants v ON v.id = sl.product_variant_id
        JOIN products p ON p.id = v.product_id
        JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE sl.reorder_point IS NOT NULL
         AND sl.quantity_on_hand <= sl.reorder_point
         AND p.is_active AND v.is_active
         ${warehouseId ? sql`AND sl.warehouse_id = ${warehouseId}` : sql``}
       ORDER BY (sl.quantity_on_hand - sl.reorder_point), p.name
    `.execute(db);
    return result.rows.map((row) => ({
      productVariantId: row.product_variant_id,
      productName: row.product_name,
      productCode: row.product_code,
      sku: row.sku,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      locationId: row.location_id,
      quantity: Number(row.quantity),
      reorderPoint: Number(row.reorder_point),
    }));
  }
}
