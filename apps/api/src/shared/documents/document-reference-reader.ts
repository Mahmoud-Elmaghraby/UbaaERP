import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

export interface DocumentReference {
  referenceType: string | null;
  referenceId: string | null;
}

export interface DocumentReferenceInfo {
  /** The document's own number (e.g. "DN-00012"); null when the document is gone or unknown. */
  number: string | null;
  /** The customer / supplier on the other side, for documents that have one. */
  partyName: string | null;
}

export const documentReferenceKey = (referenceType: string, referenceId: string): string =>
  `${referenceType}:${referenceId}`;

/**
 * Read-only: turns (reference_type, reference_id) pairs — the way stock
 * movements, journal entries and attachments point at their source
 * document — into something a person can read: the document number and
 * the customer/supplier. One query per document type present, never per
 * row. Same read-only precedent as shared/catalog/stock-item-reader:
 * it changes nothing in the owning module and triggers no behaviour.
 * Unknown types are simply absent from the result.
 */
export async function resolveDocumentReferences(
  db: Kysely<TenantDatabase>,
  references: readonly DocumentReference[],
): Promise<Map<string, DocumentReferenceInfo>> {
  const idsByType = new Map<string, Set<string>>();
  for (const { referenceType, referenceId } of references) {
    if (!referenceType || !referenceId || !UUID.test(referenceId)) continue;
    const set = idsByType.get(referenceType) ?? new Set<string>();
    set.add(referenceId);
    idsByType.set(referenceType, set);
  }

  const result = new Map<string, DocumentReferenceInfo>();
  for (const [type, idSet] of idsByType) {
    const ids = [...idSet];
    const rows = await READERS[type]?.(db, ids);
    for (const row of rows ?? []) {
      result.set(documentReferenceKey(type, row.id), { number: row.number, partyName: row.party_name });
    }
  }
  return result;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = { id: string; number: string | null; party_name: string | null };
type Reader = (db: Kysely<TenantDatabase>, ids: string[]) => Promise<Row[]>;

const noParty = sql<string | null>`NULL`.as('party_name');

const READERS: Record<string, Reader> = {
  delivery: (db, ids) =>
    db
      .selectFrom('deliveries')
      .leftJoin('sales_orders', 'sales_orders.id', 'deliveries.sales_order_id')
      .leftJoin('customers', 'customers.id', 'sales_orders.customer_id')
      .select(['deliveries.id as id', 'deliveries.delivery_number as number', 'customers.name as party_name'])
      .where('deliveries.id', 'in', ids)
      .execute(),
  sales_return: (db, ids) =>
    db
      .selectFrom('sales_returns')
      .leftJoin('deliveries', 'deliveries.id', 'sales_returns.delivery_id')
      .leftJoin('sales_orders', 'sales_orders.id', 'deliveries.sales_order_id')
      .leftJoin('customers', 'customers.id', 'sales_orders.customer_id')
      .select(['sales_returns.id as id', 'sales_returns.return_number as number', 'customers.name as party_name'])
      .where('sales_returns.id', 'in', ids)
      .execute(),
  goods_receipt: (db, ids) =>
    db
      .selectFrom('goods_receipts')
      .leftJoin('purchase_orders', 'purchase_orders.id', 'goods_receipts.purchase_order_id')
      .leftJoin('suppliers', 'suppliers.id', 'purchase_orders.supplier_id')
      .select(['goods_receipts.id as id', 'goods_receipts.receipt_number as number', 'suppliers.name as party_name'])
      .where('goods_receipts.id', 'in', ids)
      .execute(),
  purchase_return: (db, ids) =>
    db
      .selectFrom('purchase_returns')
      .leftJoin('goods_receipts', 'goods_receipts.id', 'purchase_returns.goods_receipt_id')
      .leftJoin('purchase_orders', 'purchase_orders.id', 'goods_receipts.purchase_order_id')
      .leftJoin('suppliers', 'suppliers.id', 'purchase_orders.supplier_id')
      .select(['purchase_returns.id as id', 'purchase_returns.return_number as number', 'suppliers.name as party_name'])
      .where('purchase_returns.id', 'in', ids)
      .execute(),
  stock_transfer: (db, ids) =>
    db
      .selectFrom('stock_transfers')
      .select(['id', 'transfer_number as number', noParty])
      .where('id', 'in', ids)
      .execute(),
  stock_adjustment: (db, ids) =>
    db
      .selectFrom('stock_adjustments')
      .select(['id', 'adjustment_number as number', noParty])
      .where('id', 'in', ids)
      .execute(),
  stock_count: (db, ids) =>
    db.selectFrom('stock_counts').select(['id', 'count_number as number', noParty]).where('id', 'in', ids).execute(),
  opening_balance: (db, ids) =>
    db.selectFrom('stock_counts').select(['id', 'count_number as number', noParty]).where('id', 'in', ids).execute(),
};
