/**
 * Multi-currency gate (claude/multi-currency-strategy.md §9 — competitor
 * research on feature visibility, 2026-09-13). A pure, framework-free
 * check: a document line is only allowed to carry a currency other than
 * the tenant's own when FEATURE_KEYS.MULTI_CURRENCY is enabled for that
 * tenant.
 *
 * Deliberately NOT wired through PlanFeatureGuard/@RequireFeature() the
 * way every other feature key is (see feature-catalog.ts's own comment
 * on MULTI_CURRENCY): that mechanism gates a whole controller/route by
 * one key, but this needs to gate one field's VALUE inside otherwise-
 * mandatory documents (Sales/Purchase Invoices, Sales/Purchase Orders,
 * Quotations) — the invoice, in particular, is never gate-able at all
 * (feature-catalog.ts's own top comment). So each of those services
 * calls this directly, right after their existing assertSingleCurrency()
 * check (which only confirms a document's own lines agree with each
 * other — it says nothing about the tenant), inside the same
 * try/catch-and-rewrap-as-BusinessRuleError pattern already used for
 * assertSingleCurrency's own errors:
 *
 *   try {
 *     assertCurrencyAllowedForTenant(lines[0].unitPrice.currency, tenantCurrency, enabled);
 *   } catch (err) {
 *     const message = err instanceof Error ? err.message : String(err);
 *     throw new BusinessRuleError(message, { code: 'X.MULTI_CURRENCY_DISABLED', params: {...} });
 *   }
 *
 * Plain Error, not a module-specific BusinessRuleError: every business
 * module re-exports/wraps errors slightly differently (see each
 * service's own '../errors' import), so this stays framework/module
 * agnostic and lets each call site wrap it in its own module's error
 * type with its own error code — same shape assertSingleCurrency()
 * already uses.
 */
export function assertCurrencyAllowedForTenant(
  lineCurrency: string,
  tenantCurrency: string,
  multiCurrencyEnabled: boolean,
): void {
  if (lineCurrency === tenantCurrency) return;
  if (multiCurrencyEnabled) return;
  throw new Error(
    `This document is priced in "${lineCurrency}", which differs from this tenant's own currency ` +
      `("${tenantCurrency}") — enable Multi-Currency in Settings → Modules first.`,
  );
}
