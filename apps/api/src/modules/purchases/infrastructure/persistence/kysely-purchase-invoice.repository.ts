import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseInvoicesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseInvoiceRepository,
  CreatePurchaseInvoiceRow,
} from '../../application/ports/purchase-invoice.repository';
import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../../domain/purchase-invoice.entity';

function toDomain(row: Selectable<PurchaseInvoicesTable>): PurchaseInvoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    supplierInvoiceNumber: row.supplier_invoice_number,
    purchaseOrderId: row.purchase_order_id,
    status: row.status as PurchaseInvoiceStatus,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPurchaseInvoiceRepository implements PurchaseInvoiceRepository {
  async list(db: Kysely<TenantDatabase>): Promise<PurchaseInvoice[]> {
    const rows = await db.selectFrom('purchase_invoices').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseInvoice[]> {
    const rows = await db
      .selectFrom('purchase_invoices')
      .selectAll()
      .where('purchase_order_id', '=', purchaseOrderId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoice | null> {
    const row = await db.selectFrom('purchase_invoices').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseInvoiceRow): Promise<PurchaseInvoice> {
    const row = await db
      .insertInto('purchase_invoices')
      .values({
        id: randomUUID(),
        invoice_number: input.invoiceNumber,
        supplier_invoice_number: input.supplierInvoiceNumber,
        purchase_order_id: input.purchaseOrderId,
        status: 'draft',
        invoice_date: input.invoiceDate,
        due_date: input.dueDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseInvoiceStatus,
  ): Promise<PurchaseInvoice | null> {
    const row = await db
      .updateTable('purchase_invoices')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('purchase_invoices').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
