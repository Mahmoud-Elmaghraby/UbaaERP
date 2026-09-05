import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SupplierQuotationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SupplierQuotationRepository,
  CreateSupplierQuotationRow,
  UpdateSupplierQuotationRow,
} from '../../application/ports/supplier-quotation.repository';
import type { SupplierQuotation, SupplierQuotationStatus } from '../../domain/supplier-quotation.entity';

function toDomain(row: Selectable<SupplierQuotationsTable>): SupplierQuotation {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    supplierId: row.supplier_id,
    status: row.status as SupplierQuotationStatus,
    validUntil: row.valid_until,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySupplierQuotationRepository implements SupplierQuotationRepository {
  async list(db: Kysely<TenantDatabase>, rfqId?: string): Promise<SupplierQuotation[]> {
    let query = db.selectFrom('supplier_quotations').selectAll();
    if (rfqId) query = query.where('rfq_id', '=', rfqId);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierQuotation | null> {
    const row = await db.selectFrom('supplier_quotations').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async listByRfqIdExcluding(
    db: Kysely<TenantDatabase>,
    rfqId: string,
    excludingId: string,
  ): Promise<SupplierQuotation[]> {
    const rows = await db
      .selectFrom('supplier_quotations')
      .selectAll()
      .where('rfq_id', '=', rfqId)
      .where('id', '!=', excludingId)
      .execute();
    return rows.map(toDomain);
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSupplierQuotationRow): Promise<SupplierQuotation> {
    const row = await db
      .insertInto('supplier_quotations')
      .values({
        id: randomUUID(),
        rfq_id: input.rfqId,
        supplier_id: input.supplierId,
        status: 'received',
        valid_until: input.validUntil,
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
    input: UpdateSupplierQuotationRow,
  ): Promise<SupplierQuotation | null> {
    const row = await db
      .updateTable('supplier_quotations')
      .set({
        ...(input.validUntil !== undefined ? { valid_until: input.validUntil } : {}),
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
    status: SupplierQuotationStatus,
  ): Promise<SupplierQuotation | null> {
    const row = await db
      .updateTable('supplier_quotations')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('supplier_quotations').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
