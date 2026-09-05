import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { QuotationLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { QuotationLineRepository } from '../../application/ports/quotation-line.repository';
import type { QuotationLine, CreateQuotationLineInput } from '../../domain/quotation.entity';

function toDomain(row: Selectable<QuotationLinesTable>): QuotationLine {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    unitPrice: Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyQuotationLineRepository implements QuotationLineRepository {
  async listByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<QuotationLine[]> {
    const rows = await db
      .selectFrom('quotation_lines')
      .selectAll()
      .where('quotation_id', '=', quotationId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    quotationId: string,
    input: CreateQuotationLineInput,
  ): Promise<QuotationLine> {
    const row = await db
      .insertInto('quotation_lines')
      .values({
        id: randomUUID(),
        quotation_id: quotationId,
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

  async deleteByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<void> {
    await db.deleteFrom('quotation_lines').where('quotation_id', '=', quotationId).execute();
  }
}
