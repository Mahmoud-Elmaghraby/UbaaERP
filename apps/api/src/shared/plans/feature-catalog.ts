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
  /**
   * Multi-currency (claude/multi-currency-strategy.md §9 — competitor
   * research on feature visibility, 2026-09-13). Unlike every key above,
   * this does NOT gate a whole optional document-chain controller — it
   * gates a CAPABILITY inside otherwise-mandatory documents (a Sales/
   * Purchase Invoice/Order/Quotation line priced in a currency other
   * than the tenant's own), checked manually via
   * FeatureAvailabilityService.isEnabled() at each of those services'
   * create()/update() methods, not via @RequireFeature() on a
   * controller — see currency-gate.ts's own comment for why.
   *
   * Also unlike every key above, this defaults to DISABLED, not enabled
   * — Odoo/ERPNext/SAP B1 all keep multi-currency dormant until a tenant
   * deliberately turns it on (none gate it behind a paid plan tier), and
   * most of this platform's own tenants don't need it. Migration 0074
   * seeds an explicit `enabled: false` row in tenant_feature_toggles for
   * every tenant (existing and newly-provisioned) specifically for this
   * key — TenantFeatureTogglesRepository's fail-open "no row = enabled"
   * default is otherwise untouched and still applies to every other key.
   * Granted by every Plan (Layer 1 ceiling stays open) — only Layer 2
   * (Settings → Modules) decides whether a given tenant actually uses it.
   *
   * Key deliberately does NOT start with "accounting." even though it's
   * conceptually an Accounting-adjacent capability: FEATURE_KEYS.ACCOUNTING
   * is already the bare string 'accounting', and the Settings "Modules"
   * tab's i18n lookup (t(`settings.modules.features.${featureKey}`)) lets
   * react-i18next split a dotted key into a nested object path — so
   * 'accounting.multi_currency' would collide with 'accounting' already
   * being a leaf string in that translation object, not a nested one.
   */
  MULTI_CURRENCY: 'multi_currency',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

/** Key of the default plan every tenant gets on provisioning unless told
 * otherwise — see provisionTenant() and seed-plans.command.ts. Grants
 * every currently-known feature key, matching today's actual behavior
 * (nothing was gated before this pass) so introducing the guard doesn't
 * change what any existing or newly-provisioned tenant can do. */
export const CORE_PLAN_KEY = 'core';
