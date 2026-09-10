/**
 * Single source of truth for plan-gated feature keys — the PlanFeature
 * rows a Plan can grant, and PlanFeatureGuard checks against (see that
 * guard's own comment). A plain, flat string catalog, not a DB enum —
 * mirrors how Permission keys work (users-permissions/domain/permission
 * catalog): a fixed list enforced in application code, so a new key is
 * just a new entry here + a migration to grant it to whichever Plan rows
 * need it, not a schema migration for the key itself.
 *
 * Every key below is now actually enforced by PlanFeatureGuard
 * (Accounting's 8 controllers, plus the 7 optional pre-invoice
 * document-chain controllers in Sales/Purchases — CLAUDE.md §2.8/§13's
 * long-flagged gap, see docs/claude-context/accounting-module-status.md
 * and claude/platform-flexibility-strategy.md). Deliberately no key for
 * Sales/Purchases Invoices: the invoice is the one mandatory document in
 * each chain and is never gate-able. ALL_FEATURE_KEYS below doubles as
 * the fixed set the Settings "Modules" tab (FeatureTogglesService, Layer
 * 2 — self-service toggles on top of this Layer 1 ceiling) lists.
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
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

/** Key of the default plan every tenant gets on provisioning unless told
 * otherwise — see provisionTenant() and seed-plans.command.ts. Grants
 * every currently-known feature key, matching today's actual behavior
 * (nothing was gated before this pass) so introducing the guard doesn't
 * change what any existing or newly-provisioned tenant can do. */
export const CORE_PLAN_KEY = 'core';
