import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SalesInvoicesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesInvoiceRepository,
  CreateSalesInvoiceRow,
} from '../../application/ports/sales-invoice.repository';
import type { SalesInvoice, SalesInvoiceStatus } from '../../domain/sales-invoice.entity';

function toDomain(row: Selectable<SalesInvoicesTable>): SalesInvoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    salesOrderId: row.sales_order_id,
    status: row.status as SalesInvoiceStatus,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    pricesIncludeTax: row.prices_include_tax,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySalesInvoiceRepository implements SalesInvoiceRepository {
  async list(db: Kysely<TenantDatabase>): Promise<SalesInvoice[]> {
    const rows = await db.selectFrom('sales_invoices').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesInvoice[]> {
    const rows = await db
      .selectFrom('sales_invoices')
      .selectAll()
      .where('sales_order_id', '=', salesOrderId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesInvoice | null> {
    const row = await db.selectFrom('sales_invoices').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesInvoiceRow): Promise<SalesInvoice> {
    const row = await db
      .insertInto('sales_invoices')
      .values({
        id: randomUUID(),
        invoice_number: input.invoiceNumber,
        sales_order_id: input.salesOrderId,
        status: 'draft',
        invoice_date: input.invoiceDate,
        due_date: input.dueDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
        prices_include_tax: input.pricesIncludeTax ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SalesInvoiceStatus,
  ): Promise<SalesInvoice | null> {
    const row = await db
      .updateTable('sales_invoices')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('sales_invoices').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
