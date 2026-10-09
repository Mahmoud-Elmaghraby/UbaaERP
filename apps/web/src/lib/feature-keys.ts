/**
 * Mirror of the Plan feature keys the web app needs to branch on (source of truth:
 * apps/api/src/shared/plans/feature-catalog.ts → FEATURE_KEYS). Only a UX hint via
 * useHasFeature(); the API enforces every feature server-side (PlanFeatureGuard).
 */
export const FEATURE_KEYS = {
  ACCOUNTING: 'accounting',
  SALES_QUOTATIONS: 'sales.quotations',
  SALES_SALES_ORDERS: 'sales.sales_orders',
  SALES_DELIVERIES: 'sales.deliveries',
  PURCHASES_RFQ: 'purchases.rfq',
  PURCHASES_SUPPLIER_QUOTATIONS: 'purchases.supplier_quotations',
  PURCHASES_PURCHASE_ORDERS: 'purchases.purchase_orders',
  PURCHASES_GOODS_RECEIPTS: 'purchases.goods_receipts',
  MULTI_CURRENCY: 'multi_currency',
} as const;
