/**
 * Where each kind of record has its own page — the one map behind every "open the document" link
 * (journal entry sources, statements, the audit log). Keys are the backend's entity types.
 */
export const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  customer: (id) => `/sales/customers/${id}`,
  quotation: (id) => `/sales/quotations/${id}`,
  sales_order: (id) => `/sales/sales-orders/${id}`,
  delivery: (id) => `/sales/deliveries/${id}`,
  sales_invoice: (id) => `/sales/sales-invoices/${id}`,
  payment_received: (id) => `/sales/payments-received/${id}`,
  sales_return: (id) => `/sales/sales-returns/${id}`,
  sales_credit_note: (id) => `/sales/sales-credit-notes/${id}`,
  channel_settlement: (id) => `/sales/settlements/${id}`,
  supplier: (id) => `/purchases/suppliers/${id}`,
  purchase_requisition: (id) => `/purchases/purchase-requisitions/${id}`,
  rfq: (id) => `/purchases/rfqs/${id}`,
  purchase_order: (id) => `/purchases/purchase-orders/${id}`,
  goods_receipt: (id) => `/purchases/goods-receipts/${id}`,
  purchase_return: (id) => `/purchases/purchase-returns/${id}`,
  purchase_debit_note: (id) => `/purchases/debit-notes/${id}`,
  purchase_invoice: (id) => `/purchases/purchase-invoices/${id}`,
  supplier_payment: (id) => `/purchases/supplier-payments/${id}`,
  journal_entry: (id) => `/accounting/journal-entries/${id}`,
  bank_account: (id) => `/accounting/bank-accounts/${id}`,
  recurring_entry: (id) => `/accounting/recurring-entries/${id}`,
  fixed_asset: (id) => `/accounting/fixed-assets/${id}`,
  budget: (id) => `/accounting/budgets/${id}`,
  product: (id) => `/inventory/products/${id}`,
  warehouse: (id) => `/inventory/warehouses/${id}`,
  stock_count: (id) => `/inventory/counts/${id}`,
  landed_cost: (id) => `/inventory/landed-costs/${id}`,
  stock_transfer: (id) => `/inventory/transfers/${id}`,
  stock_adjustment: (id) => `/inventory/adjustments/${id}`,
  user: (id) => `/users/${id}`,
  role: (id) => `/roles/${id}`,
};

export function entityRoute(entityType: string, entityId: string | null | undefined): string | undefined {
  return entityId ? ENTITY_ROUTES[entityType]?.(entityId) : undefined;
}
