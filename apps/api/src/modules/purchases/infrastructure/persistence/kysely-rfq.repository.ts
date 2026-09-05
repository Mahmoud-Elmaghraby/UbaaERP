import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { RequestForQuotationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RfqRepository, CreateRfqRow, UpdateRfqRow } from '../../application/ports/rfq.repository';
import type { Rfq, RfqStatus } from '../../domain/rfq.entity';

function toDomain(row: Selectable<RequestForQuotationsTable>): Rfq {
  return {
    id: row.id,
    rfqNumber: row.rfq_number,
    sourceRequisitionId: row.source_requisition_id,
    status: row.status as RfqStatus,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyRfqRepository implements RfqRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Rfq[]> {
    const rows = await db.selectFrom('request_for_quotations').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Rfq | null> {
    const row = await db.selectFrom('request_for_quotations').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateRfqRow): Promise<Rfq> {
    const row = await db
      .insertInto('request_for_quotations')
      .values({
        id: randomUUID(),
        rfq_number: input.rfqNumber,
        source_requisition_id: input.sourceRequisitionId,
        status: 'draft',
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateRfqRow): Promise<Rfq | null> {
    const row = await db
      .updateTable('request_for_quotations')
      .set({
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(db: Kysely<TenantDatabase>, id: string, status: RfqStatus): Promise<Rfq | null> {
    const row = await db
      .updateTable('request_for_quotations')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('request_for_quotations').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
