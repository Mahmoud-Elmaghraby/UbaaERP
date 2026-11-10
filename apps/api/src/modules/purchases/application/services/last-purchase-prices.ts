import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface LastPurchasePrice {
  /** Per base unit, minor units, before taxes. */
  unitMinor: bigint;
  currency: string;
  /** The document it came from (purchase invoice / order number), for the warning. */
  documentNumber: string;
}

/**
 * The last price each variant was bought at, per base unit: the latest posted purchase invoice
 * line (net of taxes), or — never invoiced yet — the latest confirmed purchase order line. Lines
 * of `excludeOrderId` (the order being checked) don't count. One price per variant and currency;
 * callers compare only the same currency.
 */
export async function lastPurchasePrices(
  db: Kysely<TenantDatabase>,
  productVariantIds: readonly string[],
  excludeOrderId: string | null,
): Promise<Map<string, LastPurchasePrice[]>> {
  const ids = [...new Set(productVariantIds)];
  const out = new Map<string, LastPurchasePrice[]>();
  if (ids.length === 0) return out;
  const exclude = excludeOrderId ?? '00000000-0000-0000-0000-000000000000';

  const invoiced = await db
    .selectFrom('purchase_invoice_lines as l')
    .innerJoin('purchase_invoices as i', 'i.id', 'l.purchase_invoice_id')
    .innerJoin('purchase_order_lines as pol', 'pol.id', 'l.purchase_order_line_id')
    .select([
      'l.product_variant_id as variantId',
      'l.unit_price_currency as currency',
      'i.invoice_number as number',
      sql<string>`COALESCE(l.net_amount, l.unit_price_amount * l.quantity_invoiced)`.as('net'),
      sql<string>`l.quantity_invoiced * l.unit_factor`.as('baseQty'),
    ])
    .distinctOn(['l.product_variant_id', 'l.unit_price_currency'])
    .where('l.product_variant_id', 'in', ids)
    .where('i.status', '=', 'posted')
    .where('pol.purchase_order_id', '<>', exclude)
    .orderBy('l.product_variant_id')
    .orderBy('l.unit_price_currency')
    .orderBy(sql`COALESCE(i.invoice_date, i.created_at::date)`, 'desc')
    .orderBy('i.created_at', 'desc')
    .execute();

  const ordered = await db
    .selectFrom('purchase_order_lines as l')
    .innerJoin('purchase_orders as o', 'o.id', 'l.purchase_order_id')
    .select([
      'l.product_variant_id as variantId',
      'l.unit_price_currency as currency',
      'o.po_number as number',
      sql<string>`l.unit_price_amount * l.quantity`.as('net'),
      sql<string>`l.quantity * l.unit_factor`.as('baseQty'),
    ])
    .distinctOn(['l.product_variant_id', 'l.unit_price_currency'])
    .where('l.product_variant_id', 'in', ids)
    .where('o.status', 'not in', ['draft', 'cancelled'])
    .where('o.id', '<>', exclude)
    .orderBy('l.product_variant_id')
    .orderBy('l.unit_price_currency')
    .orderBy('o.created_at', 'desc')
    .execute();

  const add = (rows: typeof invoiced) => {
    for (const row of rows) {
      const qty = Number(row.baseQty);
      if (!(qty > 0)) continue;
      const list = out.get(row.variantId) ?? [];
      if (list.some((p) => p.currency === row.currency)) continue; // the invoice price wins
      list.push({ unitMinor: BigInt(Math.round(Number(row.net) / qty)), currency: row.currency, documentNumber: row.number });
      out.set(row.variantId, list);
    }
  };
  add(invoiced);
  add(ordered);
  return out;
}
