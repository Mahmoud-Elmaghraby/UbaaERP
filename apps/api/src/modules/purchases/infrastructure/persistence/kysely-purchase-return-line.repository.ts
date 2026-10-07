import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseReturnLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseReturnLineRepository,
  CreatePurchaseReturnLineRow,
} from '../../application/ports/purchase-return-line.repository';
import type { PurchaseReturnLine } from '../../domain/purchase-return.entity';

function toDomain(row: Selectable<PurchaseReturnLinesTable>): PurchaseReturnLine {
  return {
    id: row.id,
    purchaseReturnId: row.purchase_return_id,
    goodsReceiptLineId: row.goods_receipt_line_id,
    productVariantId: row.product_variant_id,
    quantityReturned: Number(row.quantity_returned),
    reason: row.reason,
    notes: row.notes,
    unitOfMeasureId: row.unit_of_measure_id,
    unitFactor: Number(row.unit_factor),
    createdAt: row.created_at,
  };
}

export class KyselyPurchaseReturnLineRepository implements PurchaseReturnLineRepository {
  async listByPurchaseReturnId(db: Kysely<TenantDatabase>, purchaseReturnId: string): Promise<PurchaseReturnLine[]> {
    const rows = await db
      .selectFrom('purchase_return_lines')
      .selectAll()
      .where('purchase_return_id', '=', purchaseReturnId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    purchaseReturnId: string,
    input: CreatePurchaseReturnLineRow,
  ): Promise<PurchaseReturnLine> {
    const row = await db
      .insertInto('purchase_return_lines')
      .values({
        id: randomUUID(),
        unit_of_measure_id: input.unitOfMeasureId ?? null,
        unit_factor: String(input.unitFactor ?? 1),
        purchase_return_id: purchaseReturnId,
        goods_receipt_line_id: input.goodsReceiptLineId,
        product_variant_id: input.productVariantId,
        quantity_returned: String(input.quantityReturned),
        reason: input.reason,
        notes: input.notes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumReturnedQuantityByGoodsReceiptLineIds(
    db: Kysely<TenantDatabase>,
    goodsReceiptLineIds: string[],
  ): Promise<Record<string, number>> {
    if (goodsReceiptLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('purchase_return_lines')
      .innerJoin('purchase_returns', 'purchase_returns.id', 'purchase_return_lines.purchase_return_id')
      .select((eb) => [
        'purchase_return_lines.goods_receipt_line_id as goods_receipt_line_id',
        eb.fn.sum<string>('purchase_return_lines.quantity_returned').as('total'),
      ])
      .where('purchase_returns.status', '=', 'confirmed')
      .where('purchase_return_lines.goods_receipt_line_id', 'in', goodsReceiptLineIds)
      .groupBy('purchase_return_lines.goods_receipt_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.goods_receipt_line_id] = Number(row.total);
    }
    return result;
  }
}
