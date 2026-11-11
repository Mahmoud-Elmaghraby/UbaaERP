# Settings hub — phase 2 (2026-11-09, uncommitted)

Phase 1 is in claude/settings-hub-2026-11-09.md; the plan is in the Claude Doc https://claude.ai/artifact/EKHKN8HJizFTNRYvGmuWfU

Phase 1 was committed (`702d630`, docs `24f446a`).

## User decisions
- **Discount limit:** one limit for the whole company. The new permission `sales.override_limits` passes it. There is no limit per role.
- **Below cost / below the minimum price:** each is a setting with three choices: allow, warn, block. The same `sales.override_limits` passes a block.
- **Scope:** returns and dates, document defaults, POS, and moving the old settings into the central store.

## Registry (`APP_SETTINGS`)
- New kinds:
  - nullable numbers, where null means "no limit";
  - decimals;
  - text.
- New fields on each entry:
  - `feature`: the setting is hidden while that activity switch is off;
  - `group`: a heading inside the section.
- `APP_SETTING_SECTION_PERMISSIONS`:
  - security and documents need `settings.manage`;
  - sales and POS need `settings.manage` or `sales.settings.manage`.
- PATCH now resets a key with `{ reset: true }`. A plain `null` is a value ("no limit").
- `GET /app-settings` is open to any signed-in user, because the POS and the editors read it.
- `AppSettingsRepository.getMany()` reads several keys in one query.

**Sales settings**
- `sales.maxDiscountPercent`
- `sales.belowCostMode`
- `sales.belowMinPriceMode`
- `sales.creditLimitMode`, moved here from `tenant_settings`
- `sales.returnWindowDays`
- `sales.repRequired` (needs the `sales.reps` switch)
- `sales.prefillWalkInCustomer`
- `sales.defaultInvoiceNotes`
- `sales.defaultQuotationTerms`

**POS settings** (all need the `pos` switch)
- `pos.maxDiscountPercent`, moved here from `tenant_settings`
- `pos.cashRounding`: none / quarter / half / one
- `pos.autoPrintReceipt`
- `pos.receiptShowCashier`

**Document settings**
- `documents.backdateDays`
- `documents.allowFutureDates`

## Migration 0120_sales_settings
- Copies `credit_limit_mode` and `pos_max_discount_percent` into `app_settings`, but only when they had been set. The old columns stay in place, unread; nothing is dropped.
- Adds `products.min_sale_price_amount` and `products.min_sale_price_currency`, with a pair check and a non-negative check.
- New permissions:
  - `sales.override_limits`: given to the roles holding `sales.override_credit_limit`, and to Owner.
  - `documents.backdate`: given to the roles holding `settings.manage`, and to Owner.

## How it works
**Sales limits**
- `SalesLimitsService` (Sales application) uses the pure functions in `domain/sales-limits.ts` and `shared/catalog/sale-price-floor-reader.ts`.
- Cost is the weighted average cost of the stock on hand across locations, or the purchase price when nothing is in stock.
- Prices are compared per base unit, after line and document discounts (`distributeOrderTotalAcrossLines`).
- When the limits are checked:
  - **Order confirm:** the controller passes the user's permissions.
  - **Invoice post:** prices are checked only in direct invoicing, when Sales Orders is off. The rep rule always applies.
- Endpoints: `GET /sales-orders/:id/limits-check` and `GET /sales-invoices/:id/limits-check`.
- What stops the user:
  - a missing required rep blocks for everyone;
  - a discount over the limit, or a price in "block" mode, blocks unless the user holds `sales.override_limits`;
  - "warn" mode asks first in the UI.
- The cost amount is shown only to users who may see costs.

**Return window**
- Checked in `SalesReturnsService.create` from the delivery date, both from the controller and from POS returns.
- `sales.override_limits` accepts a late return.

**Document dates**
- `shared/app-settings/document-date.ts` has the `@CheckDocumentDates('field')` guard. It is on the create/update endpoints of:
  - sales: invoices, returns, receipts, refunds, deliveries;
  - purchases: invoices, returns, goods receipts, supplier payments;
  - inventory: stock transfers and adjustments;
  - accounting: journal entries.
- `documents.backdate` skips the check. An empty date means today, which is always allowed.
- The date is checked when it is entered, not again at posting.

**POS**
- The discount limit now comes from `pos.maxDiscountPercent`.
- Cash rounding always rounds down. It applies only when every tender is cash and there is no % discount, and it is sent as part of the sale's fixed discount, so no account is needed.
- A sale discount smaller than the rounding step does not count against the cashier's limit.
- Auto-print opens the 80 mm receipt after checkout.
- The cashier's name appears on the receipt when `pos.receiptShowCashier` is on (sales-invoice print provider).
- The logo, footer and the rest of the receipt's look stay in the print templates, not in duplicate settings.

**Not covered:** prices are not checked at the POS. The supervisor PIN already controls POS discounts.

## Web
- `lib/app-settings.ts` has `useAppSetting().get(key)`. It returns the defaults until the settings load.
- `AppSettingsSection` was rewritten:
  - grouped cards;
  - nullable numbers, decimals and text;
  - feature filter;
  - reset sent as `{reset:true}`;
  - validation through `appSettingValueSchema`.
- New hub sections: Sales, POS (with a link to the print templates) and Document dates. The old `sales-settings-section.tsx` and `pos-discount-limit-field.tsx` were deleted.
- `features/sales/lib/sales-limits.tsx` has `useSalesLimitsCheck`, `confirmSalesLimits` and `SalesLimitsCallout`. They are used on the order page and the invoice page.
- `use-new-document-defaults.ts` prefills the walk-in customer and the notes/terms on new orders, invoices and quotations.
- Product form: a "lowest sale price" field. It shows only while the min-price check is on, or when the product already has one.

## Verification
- api + web tsc and eslint clean.
- Unit: 464 tests (+5, `sales-limits.spec.ts`).
- Integration: 32 suites / 174 tests.
- `settings-hub.int-spec.ts` now also covers:
  - null, decimal and text values;
  - section permissions;
  - price floors;
  - `SalesLimitsService`;
  - the return window.
- Screenshots: the sales, POS and document-dates sections.

## Still open (phases 3–4 in the doc)
- Fixed or editable document numbers.
- Purchases settings.
- Inventory settings moved into the hub.
- Dropping the old `tenant_settings` columns (needs approval).
