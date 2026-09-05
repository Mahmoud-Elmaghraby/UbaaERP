import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SalesCreditNotesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesCreditNoteRepository,
  CreateSalesCreditNoteRow,
} from '../../application/ports/sales-credit-note.repository';
import type { SalesCreditNote } from '../../domain/sales-credit-note.entity';

function toDomain(row: Selectable<SalesCreditNotesTable>): SalesCreditNote {
  return {
    id: row.id,
    creditNoteNumber: row.credit_note_number,
    salesReturnId: row.sales_return_id,
    customerId: row.customer_id,
    currency: row.currency,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySalesCreditNoteRepository implements SalesCreditNoteRepository {
  async list(db: Kysely<TenantDatabase>): Promise<SalesCreditNote[]> {
    const rows = await db.selectFrom('sales_credit_notes').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesCreditNote | null> {
    const row = await db.selectFrom('sales_credit_notes').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findBySalesReturnId(db: Kysely<TenantDatabase>, salesReturnId: string): Promise<SalesCreditNote | null> {
    const row = await db
      .selectFrom('sales_credit_notes')
      .selectAll()
      .where('sales_return_id', '=', salesReturnId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesCreditNoteRow): Promise<SalesCreditNote> {
    const row = await db
      .insertInto('sales_credit_notes')
      .values({
        id: randomUUID(),
        credit_note_number: input.creditNoteNumber,
        sales_return_id: input.salesReturnId,
        customer_id: input.customerId,
        currency: input.currency,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
