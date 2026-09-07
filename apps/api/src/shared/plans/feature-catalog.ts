/**
 * Single source of truth for plan-gated feature keys — the PlanFeature
 * rows a Plan can grant, and PlanFeatureGuard checks against (see that
 * guard's own comment). A plain, flat string catalog, not a DB enum —
 * mirrors how Permission keys work (users-permissions/domain/permission
 * catalog): a fixed list enforced in application code, so a new key is
 * just a new entry here + a migration to grant it to whichever Plan rows
 * need it, not a schema migration for the key itself.
 *
 * Only ACCOUNTING is actually enforced by a guard so far (wired onto
 * every Accounting controller this pass — CLAUDE.md §2.8/§13's
 * long-flagged gap, see docs/claude-context/accounting-module-status.md).
 * The Sales/Purchases document-step keys below are defined and already
 * granted to the default "core" plan (see seed-plans.command.ts) so a
 * later pass that wires PlanFeatureGuard onto those controllers doesn't
 * need a second migration just to add the keys — but nothing reads or
 * enforces them yet. Deliberately no key for Sales/Purchases Invoices:
 * per the platform-flexibility design (claude/platform-flexibility-
 * strategy.md), the invoice is the one mandatory document in each
 * chain and is never gate-able.
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
