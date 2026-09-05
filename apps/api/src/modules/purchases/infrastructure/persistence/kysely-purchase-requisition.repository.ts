import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseRequisitionsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseRequisitionRepository,
  CreatePurchaseRequisitionRow,
  UpdatePurchaseRequisitionRow,
} from '../../application/ports/purchase-requisition.repository';
import type { PurchaseRequisition, PurchaseRequisitionStatus } from '../../domain/purchase-requisition.entity';

function toDomain(row: Selectable<PurchaseRequisitionsTable>): PurchaseRequisition {
  return {
    id: row.id,
    requisitionNumber: row.requisition_number,
    requestedBy: row.requested_by,
    branchId: row.branch_id,
    status: row.status as PurchaseRequisitionStatus,
    neededByDate: row.needed_by_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPurchaseRequisitionRepository implements PurchaseRequisitionRepository {
  async list(db: Kysely<TenantDatabase>): Promise<PurchaseRequisition[]> {
    const rows = await db
      .selectFrom('purchase_requisitions')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition | null> {
    const row = await db
      .selectFrom('purchase_requisitions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseRequisitionRow): Promise<PurchaseRequisition> {
    const row = await db
      .insertInto('purchase_requisitions')
      .values({
        id: randomUUID(),
        requisition_number: input.requisitionNumber,
        requested_by: input.requestedBy,
        branch_id: input.branchId,
        status: 'draft',
        needed_by_date: input.neededByDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseRequisitionRow,
  ): Promise<PurchaseRequisition | null> {
    const row = await db
      .updateTable('purchase_requisitions')
      .set({
        ...(input.branchId !== undefined ? { branch_id: input.branchId } : {}),
        ...(input.neededByDate !== undefined ? { needed_by_date: input.neededByDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseRequisitionStatus,
  ): Promise<PurchaseRequisition | null> {
    const row = await db
      .updateTable('purchase_requisitions')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('purchase_requisitions').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
