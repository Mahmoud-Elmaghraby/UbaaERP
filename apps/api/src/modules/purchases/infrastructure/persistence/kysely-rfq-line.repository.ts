import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { RfqLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RfqLineRepository } from '../../application/ports/rfq-line.repository';
import type { RfqLine, CreateRfqLineInput } from '../../domain/rfq.entity';

function toDomain(row: Selectable<RfqLinesTable>): RfqLine {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyRfqLineRepository implements RfqLineRepository {
  async listByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<RfqLine[]> {
    const rows = await db
      .selectFrom('rfq_lines')
      .selectAll()
      .where('rfq_id', '=', rfqId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(db: Kysely<TenantDatabase>, rfqId: string, input: CreateRfqLineInput): Promise<RfqLine> {
    const row = await db
      .insertInto('rfq_lines')
      .values({
        id: randomUUID(),
        rfq_id: rfqId,
        product_variant_id: input.productVariantId,
        quantity: String(input.quantity),
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async deleteByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<void> {
    await db.deleteFrom('rfq_lines').where('rfq_id', '=', rfqId).execute();
  }
}
