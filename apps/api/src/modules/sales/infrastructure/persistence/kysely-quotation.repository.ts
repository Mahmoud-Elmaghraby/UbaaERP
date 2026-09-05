import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { QuotationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  QuotationRepository,
  CreateQuotationRow,
  UpdateQuotationRow,
} from '../../application/ports/quotation.repository';
import type { Quotation, QuotationStatus } from '../../domain/quotation.entity';

function toDomain(row: Selectable<QuotationsTable>): Quotation {
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    customerId: row.customer_id,
    status: row.status as QuotationStatus,
    validUntilDate: row.valid_until_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyQuotationRepository implements QuotationRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Quotation[]> {
    const rows = await db.selectFrom('quotations').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Quotation | null> {
    const row = await db.selectFrom('quotations').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateQuotationRow): Promise<Quotation> {
    const row = await db
      .insertInto('quotations')
      .values({
        id: randomUUID(),
        quotation_number: input.quotationNumber,
        customer_id: input.customerId,
        status: 'draft',
        valid_until_date: input.validUntilDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateQuotationRow): Promise<Quotation | null> {
    const row = await db
      .updateTable('quotations')
      .set({
        ...(input.validUntilDate !== undefined ? { valid_until_date: input.validUntilDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(db: Kysely<TenantDatabase>, id: string, status: QuotationStatus): Promise<Quotation | null> {
    const row = await db
      .updateTable('quotations')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('quotations').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
