import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { Money } from '@erp-platform/shared-kernel';
import type { SalesCreditNoteLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesCreditNoteLineRepository } from '../../application/ports/sales-credit-note-line.repository';
import type { SalesCreditNoteLine, CreateSalesCreditNoteLineInput } from '../../domain/sales-credit-note.entity';

function toDomain(row: Selectable<SalesCreditNoteLinesTable>): SalesCreditNoteLine {
  const unitPrice = Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency);
  return {
    id: row.id,
    salesCreditNoteId: row.sales_credit_note_id,
    salesReturnLineId: row.sales_return_line_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    unitPrice,
    netAmount:
      row.net_amount !== null
        ? Money.fromMinorUnits(BigInt(row.net_amount), row.unit_price_currency)
        : unitPrice.multiplyByQuantity(Number(row.quantity)),
    taxes: parseSnapshot(row.taxes),
    unitOfMeasureId: row.unit_of_measure_id,
    unitFactor: Number(row.unit_factor),
    createdAt: row.created_at,
  };
}

export class KyselySalesCreditNoteLineRepository implements SalesCreditNoteLineRepository {
  async listBySalesCreditNoteId(
    db: Kysely<TenantDatabase>,
    salesCreditNoteId: string,
  ): Promise<SalesCreditNoteLine[]> {
    const rows = await db
      .selectFrom('sales_credit_note_lines')
      .selectAll()
      .where('sales_credit_note_id', '=', salesCreditNoteId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    salesCreditNoteId: string,
    input: CreateSalesCreditNoteLineInput,
  ): Promise<SalesCreditNoteLine> {
    const row = await db
      .insertInto('sales_credit_note_lines')
      .values({
        id: randomUUID(),
        unit_of_measure_id: input.unitOfMeasureId ?? null,
        unit_factor: String(input.unitFactor ?? 1),
        sales_credit_note_id: salesCreditNoteId,
        sales_return_line_id: input.salesReturnLineId,
        product_variant_id: input.productVariantId,
        quantity: String(input.quantity),
        unit_price_amount: input.unitPrice.toMinorUnits().toString(),
        unit_price_currency: input.unitPrice.currency,
        net_amount: input.netAmount.toMinorUnits().toString(),
        taxes: JSON.stringify(input.taxes),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
