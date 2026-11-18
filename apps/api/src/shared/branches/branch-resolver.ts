import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/**
 * Where a document belongs (migration 0130: a branch is a dimension, one company). Read-only
 * lookups any module may use — configuration-style data, not another module's behaviour
 * (CLAUDE.md §2.6). The first hint that resolves wins; nothing resolves → the main branch.
 */
export interface BranchHints {
  branchId?: string | null;
  warehouseId?: string | null;
  treasuryId?: string | null;
  posSessionId?: string | null;
  salesOrderId?: string | null;
  deliveryId?: string | null;
  salesReturnId?: string | null;
  purchaseOrderId?: string | null;
  goodsReceiptId?: string | null;
  purchaseReturnId?: string | null;
}

export async function mainBranchId(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('branches').select('id').where('is_main', '=', true).executeTakeFirst();
  if (row) return row.id;
  // A tenant provisioned before 0130 always has one; this only guards a hand-edited database.
  const any = await db.selectFrom('branches').select('id').orderBy('created_at').executeTakeFirstOrThrow();
  return any.id;
}

export async function resolveBranchId(db: Kysely<TenantDatabase>, hints: BranchHints = {}): Promise<string> {
  if (hints.branchId) return hints.branchId;
  const viaTable = async (
    table: 'warehouses' | 'treasuries' | 'pos_sessions' | 'sales_orders' | 'purchase_orders' | 'sales_returns' | 'purchase_returns',
    id: string | null | undefined,
  ): Promise<string | null> => {
    if (!id) return null;
    const row = await db.selectFrom(table).select('branch_id').where('id', '=', id).executeTakeFirst();
    return (row?.branch_id as string | null | undefined) ?? null;
  };
  const viaDelivery = async (id: string | null | undefined) => {
    if (!id) return null;
    const row = await db
      .selectFrom('deliveries as d')
      .innerJoin('warehouses as w', 'w.id', 'd.warehouse_id')
      .select('w.branch_id')
      .where('d.id', '=', id)
      .executeTakeFirst();
    return row?.branch_id ?? null;
  };
  const viaGoodsReceipt = async (id: string | null | undefined) => {
    if (!id) return null;
    const row = await db
      .selectFrom('goods_receipts as g')
      .innerJoin('warehouses as w', 'w.id', 'g.warehouse_id')
      .select('w.branch_id')
      .where('g.id', '=', id)
      .executeTakeFirst();
    return row?.branch_id ?? null;
  };
  return (
    (await viaTable('pos_sessions', hints.posSessionId)) ??
    (await viaTable('warehouses', hints.warehouseId)) ??
    (await viaTable('treasuries', hints.treasuryId)) ??
    (await viaDelivery(hints.deliveryId)) ??
    (await viaGoodsReceipt(hints.goodsReceiptId)) ??
    (await viaTable('sales_returns', hints.salesReturnId)) ??
    (await viaTable('purchase_returns', hints.purchaseReturnId)) ??
    (await viaTable('sales_orders', hints.salesOrderId)) ??
    (await viaTable('purchase_orders', hints.purchaseOrderId)) ??
    (await mainBranchId(db))
  );
}

/** Source documents whose own branch_id a journal entry takes (same mapping as migration 0130). */
const SOURCE_TABLES: Record<string, 'sales_invoices' | 'sales_credit_notes' | 'payments_received' | 'customer_refunds' | 'pos_sessions' | 'channel_settlements' | 'purchase_invoices' | 'purchase_debit_notes' | 'supplier_payments' | 'treasury_vouchers' | 'treasuries' | 'hr_payroll_runs'> = {
  sales_invoice: 'sales_invoices',
  sales_credit_note: 'sales_credit_notes',
  payment_received: 'payments_received',
  customer_refund: 'customer_refunds',
  pos_session: 'pos_sessions',
  channel_settlement: 'channel_settlements',
  purchase_invoice: 'purchase_invoices',
  purchase_debit_note: 'purchase_debit_notes',
  supplier_payment: 'supplier_payments',
  treasury_voucher: 'treasury_vouchers',
  treasury_opening_balance: 'treasuries',
  hr_payroll: 'hr_payroll_runs',
};

/**
 * The branch of the document an automatic journal entry was made from: its own branch_id, or —
 * for stock-driven entries (COGS, receipts, adjustments, counts) — the warehouse its movements
 * touched. Null when the source has none (the caller falls back to the main branch).
 */
export async function branchOfSource(
  db: Kysely<TenantDatabase>,
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
): Promise<string | null> {
  if (!sourceType || !sourceId) return null;
  const table = SOURCE_TABLES[sourceType];
  if (table) {
    const row = await db.selectFrom(table).select('branch_id').where('id', '=', sourceId).executeTakeFirst();
    if (row?.branch_id) return row.branch_id as string;
  }
  const moved = await db
    .selectFrom('stock_movements as m')
    .innerJoin('warehouses as w', 'w.id', 'm.warehouse_id')
    .select('w.branch_id')
    .where('m.reference_id', '=', sourceId)
    .orderBy('m.created_at')
    .executeTakeFirst();
  return moved?.branch_id ?? null;
}
