import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { GoodsReceiptLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  GoodsReceiptLineRepository,
  CreateGoodsReceiptLineRow,
} from '../../application/ports/goods-receipt-line.repository';
import type { GoodsReceiptLine } from '../../domain/goods-receipt.entity';

function toDomain(row: Selectable<GoodsReceiptLinesTable>): GoodsReceiptLine {
  return {
    id: row.id,
    goodsReceiptId: row.goods_receipt_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    productVariantId: row.product_variant_id,
    quantityReceived: Number(row.quantity_received),
    unitCost: Money.fromMinorUnits(BigInt(row.unit_cost_amount), row.unit_cost_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyGoodsReceiptLineRepository implements GoodsReceiptLineRepository {
  async listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<GoodsReceiptLine[]> {
    const rows = await db
      .selectFrom('goods_receipt_lines')
      .selectAll()
      .where('goods_receipt_id', '=', goodsReceiptId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    goodsReceiptId: string,
    input: CreateGoodsReceiptLineRow,
  ): Promise<GoodsReceiptLine> {
    const row = await db
      .insertInto('goods_receipt_lines')
      .values({
        id: randomUUID(),
        goods_receipt_id: goodsReceiptId,
        purchase_order_line_id: input.purchaseOrderLineId,
        product_variant_id: input.productVariantId,
        quantity_received: String(input.quantityReceived),
        unit_cost_amount: input.unitCost.toMinorUnits().toString(),
        unit_cost_currency: input.unitCost.currency,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumReceivedQuantityByPurchaseOrderLineIds(
    db: Kysely<TenantDatabase>,
    purchaseOrderLineIds: string[],
  ): Promise<Record<string, number>> {
    if (purchaseOrderLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('goods_receipt_lines')
      .innerJoin('goods_receipts', 'goods_receipts.id', 'goods_receipt_lines.goods_receipt_id')
      .select((eb) => [
        'goods_receipt_lines.purchase_order_line_id as purchase_order_line_id',
        eb.fn.sum<string>('goods_receipt_lines.quantity_received').as('total'),
      ])
      .where('goods_receipts.status', '=', 'confirmed')
      .where('goods_receipt_lines.purchase_order_line_id', 'in', purchaseOrderLineIds)
      .groupBy('goods_receipt_lines.purchase_order_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.purchase_order_line_id] = Number(row.total);
    }
    return result;
  }
}
