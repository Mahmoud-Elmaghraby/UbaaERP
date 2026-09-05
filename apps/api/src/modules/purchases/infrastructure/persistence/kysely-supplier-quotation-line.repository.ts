import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { SupplierQuotationLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SupplierQuotationLineRepository } from '../../application/ports/supplier-quotation-line.repository';
import type {
  SupplierQuotationLine,
  CreateSupplierQuotationLineInput,
} from '../../domain/supplier-quotation.entity';

function toDomain(row: Selectable<SupplierQuotationLinesTable>): SupplierQuotationLine {
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

export class KyselySupplierQuotationLineRepository implements SupplierQuotationLineRepository {
  async listByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<SupplierQuotationLine[]> {
    const rows = await db
      .selectFrom('supplier_quotation_lines')
      .selectAll()
      .where('quotation_id', '=', quotationId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    quotationId: string,
    input: CreateSupplierQuotationLineInput,
  ): Promise<SupplierQuotationLine> {
    const row = await db
      .insertInto('supplier_quotation_lines')
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
    await db.deleteFrom('supplier_quotation_lines').where('quotation_id', '=', quotationId).execute();
  }
}
