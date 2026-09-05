import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseRequisitionLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseRequisitionLineRepository } from '../../application/ports/purchase-requisition-line.repository';
import type {
  PurchaseRequisitionLine,
  CreatePurchaseRequisitionLineInput,
} from '../../domain/purchase-requisition.entity';

function toDomain(row: Selectable<PurchaseRequisitionLinesTable>): PurchaseRequisitionLine {
  return {
    id: row.id,
    requisitionId: row.requisition_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyPurchaseRequisitionLineRepository implements PurchaseRequisitionLineRepository {
  async listByRequisitionId(db: Kysely<TenantDatabase>, requisitionId: string): Promise<PurchaseRequisitionLine[]> {
    const rows = await db
      .selectFrom('purchase_requisition_lines')
      .selectAll()
      .where('requisition_id', '=', requisitionId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    requisitionId: string,
    input: CreatePurchaseRequisitionLineInput,
  ): Promise<PurchaseRequisitionLine> {
    const row = await db
      .insertInto('purchase_requisition_lines')
      .values({
        id: randomUUID(),
        requisition_id: requisitionId,
        product_variant_id: input.productVariantId,
        quantity: String(input.quantity),
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async deleteByRequisitionId(db: Kysely<TenantDatabase>, requisitionId: string): Promise<void> {
    await db.deleteFrom('purchase_requisition_lines').where('requisition_id', '=', requisitionId).execute();
  }
}
