import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PurchaseOrderLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseOrderLineRepository } from '../../application/ports/purchase-order-line.repository';
import type { PurchaseOrderLine, CreatePurchaseOrderLineInput } from '../../domain/purchase-order.entity';

function toDomain(row: Selectable<PurchaseOrderLinesTable>): PurchaseOrderLine {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    unitPrice: Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyPurchaseOrderLineRepository implements PurchaseOrderLineRepository {
  async listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseOrderLine[]> {
    const rows = await db
      .selectFrom('purchase_order_lines')
      .selectAll()
      .where('purchase_order_id', '=', purchaseOrderId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    purchaseOrderId: string,
    input: CreatePurchaseOrderLineInput,
  ): Promise<PurchaseOrderLine> {
    const row = await db
      .insertInto('purchase_order_lines')
      .values({
        id: randomUUID(),
        purchase_order_id: purchaseOrderId,
        product_variant_id: input.productVariantId,
        quantity: String(input.quantity),
        unit_price_amount: input.unitPrice.toMinorUnits().toString(),
        unit_price_currency: input.unitPrice.currency,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async deleteByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<void> {
    await db.deleteFrom('purchase_order_lines').where('purchase_order_id', '=', purchaseOrderId).execute();
  }
}
