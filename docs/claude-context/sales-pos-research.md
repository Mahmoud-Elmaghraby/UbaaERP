# POS (Point of Sale) — Research & Design

**Date:** 2026-09-05 (Stage 1), updated 2026-09-05 (Stage 2), updated 2026-09-05 (Stage 3), updated
2026-09-05 (Stage 4), updated 2026-09-05 (Stage 5). Planning pass done before any POS code, per
CLAUDE.md's "research/design first, then build stage by stage" discipline. This extends the Sales
module — master doc §9.2 already calls for a POS frontend mode sharing the same backend documents
as the full B2B sales cycle (see `sales-module-research.md`'s "Note on POS mode" — flagged there,
not designed until now).

## Why POS is a Sales extension, not a new module

POS is a fast checkout UX and a cash-session concept layered on top of documents that already
exist: Sales Orders, Deliveries, Sales Invoices, Payments Received. No new business module, no new
bounded context. The only genuinely new domain concept is the **cash session (shift)** — everything
else is either reuse or small additive fields on existing entities.

## Competitor research (Daftra, Odoo)

- Every POS system examined models a **cash session/shift**: cashier opens with a declared opening
  float, sells during the shift, closes by counting physical cash, and the system reports the
  variance against what it expected.
- **Split/multi-tender payment** (e.g. part cash, part card on one sale) is standard and needs no
  special schema beyond what already exists here (see below).
- **Offline-first POS** (keep selling during a network outage, sync later) is common in dedicated
  POS products but adds significant complexity (conflict resolution, local queues). Rejected for v1
  per user decision — online-only is enough.
- **Discounts** at both line level and document level are standard.
- **Barcode scanning** in every system examined is USB-scanner-as-keyboard-emulation — the scanner
  just types the barcode + Enter into whatever input is focused. No special hardware SDK or driver
  integration needed; the barcode field already in this codebase's Inventory items is sufficient.
- **X Report / Z Report**: an X report is a non-destructive, repeatable snapshot taken any time
  during an open shift; a Z report is the same summary but generated once the shift is closed and
  its figures become final. Every system examined treats these as the same underlying computation,
  not two different reports.

## Confirmed architectural decisions (user)

1. **Cash session/shift is required from day one** (not deferred to a v2).
2. **Online-only for v1** — no offline mode, no local queue/sync engine.
3. **Split/multi-tender payment is required.**
4. **Discounts required at both line level and invoice level.**
5. **Cash Over/Short posts a real automatic journal entry** (not just a reporting figure).
6. **A default "Walk-in / Cash Customer" is auto-provisioned per tenant.**
7. **A POS session's warehouse is resolved once per session, at open time** (Stage 3) — not per
   checkout, and not derived from `user_branch_access`.
8. **A header-level Sales Order discount is distributed proportionally across the invoice's lines**
   (Stage 3, largest-remainder rounding), rather than left unreflected in the invoice or represented
   as a synthetic invoice line.
9. **The POS screen is a standalone top-level sidebar item** ("نقطة البيع" / Point of Sale, Stage
   4) — not nested under Sales' existing tabs. A cashier lives on this one screen for a whole shift;
   burying it under `/sales/...` would fight that.
10. **X Report and Z Report share one endpoint and one response shape** (Stage 5) — an open
    session's report is the "X" view (live figures), a closed session's report is the "Z" view
    (stored, immutable figures); there is no separate schema or route for each.
11. **X/Z report scope for v1 is sales totals + payment-method breakdown + cash summary** — gross
    sales before discount and "total discounts given" are explicitly NOT included (would need a new
    `pos_session_id` column on `sales_orders`/`sales_invoices`, which nothing currently needs).

## Design

### 1. `pos_sessions` (Stage 1, BUILT)

A tenant-schema entity (migration `0059_create_pos_sessions`): `id`, `cashier_user_id` (FK users,
ON DELETE RESTRICT), `status` (`open`|`closed`), `opening_cash_amount`/`currency`,
`expected_cash_amount`, `counted_cash_amount`, `variance_amount` (all three nullable until close,
then stored/immutable), `notes`, `opened_at`, `closed_at`. Partial UNIQUE index enforces at most
one open session per cashier.

`PosSessionsService.open()`/`.close()` — `close()` computes `expected = opening + sum(cash
payments_received tagged with this session)`, `variance = counted - expected`, and — when
non-zero — writes a `sales.pos_session.closed` Outbox event (CLAUDE.md §5) in the same transaction.
`payments_received` gained a nullable `pos_session_id` FK (migration `0060`) ahead of Stage 3.

**Cash Over/Short auto-posting — BUILT.** `accounting_settings` gained `cash_account_id` (migration
`0061`, auto-populated from template code '111') and `cash_over_short_account_id` (never
auto-populated). `AccountingAutoPostingListeners.handlePosSessionClosed()` reacts to
`sales.pos_session.closed`: over → debit Cash, credit Cash Over/Short; short → the reverse.

### 2. Discounts (Stage 2 backend BUILT; Stage 4 frontend BUILT)

Migration `0062_add_discounts_to_sales_orders`: both `sales_orders` (header) and
`sales_order_lines` (line) gained `discount_type` (`percentage`|`fixed`|NULL),
`discount_percentage` (NUMERIC(6,3), same convention as `tax_rules.rate`), and
`discount_fixed_amount` (BIGINT minor units) — a CHECK constraint on each table enforces exactly
one of "no discount" / "percentage set" / "fixed set", mirroring `journal_entry_lines`'s own
exactly-one-side CHECK. `sales_orders` also gained a plain `currency` column (populated once at
creation from the order's own lines) so a header-level fixed discount can become a real `Money`
value at the repository layer, which has no join to the order's lines.

`sales-order.entity.ts` gained a `Discountable` shared shape, `calculateLineNetAmount()` (gross
minus that line's own discount), and `calculateSalesOrderTotal()` returns
`{ subtotalAmount, totalAmount }` — subtotal is the sum of line-net amounts, total is subtotal with
the header-level discount applied on top. Both discount levels compose correctly and independently.
`SalesOrdersService.create()`/`.update()` validate discount consistency (percentage range,
fixed-not-exceeding-gross, currency match) and surface violations as `BusinessRuleError`.
`SalesOrdersController`/`libs/contracts`'s `sales-order.contract.ts` carry the same fields through
end to end.

**Frontend (Stage 4, BUILT).** `discount-fields.tsx` lives at a module-level
`apps/web/src/features/sales/lib/` (see "Why a shared `lib/` file" below) — exports `DiscountDraft`,
`createEmptyDiscountDraft()`, `discountDraftFromDto()`, `resolveDiscountInput()`, and the
`<DiscountFields>` control. Wired into: all three Sales Order forms (from-quotation, manual, edit)
as a header-level control; `SalesOrderLineItemsEditor` as a compact per-row Select+Input pair; and
`SalesOrderDetailsView` as a read-only `formatDiscountLabel()` display (header discount +
`subtotalAmount`, and a per-line discount column). New i18n keys added under `sales.salesOrders.*`:
`discountSectionTitle`, `discountType(None/Percentage/Fixed)`, `discountPercentage`,
`discountFixedAmount`, `discountError`, `lineDiscount`, `subtotalAmount` — all cross-checked against
every `t(...)` call site that references them.

### 3. Walk-in / Cash Customer (Stage 2, BUILT)

Migration `0063_add_is_system_default_to_customers`: `customers` gained `is_system_default`
(partial UNIQUE index — at most one per tenant), never settable through the ordinary Customers API.
`walk-in-customer-seed.ts` (mirrors `owner-seed.ts`) seeds one "Walk-in Customer / عميل نقدي" row,
idempotent, currency defaulted from `tenant_settings.currency_code` (or 'EGP' if that row doesn't
exist yet). Wired into `provisionTenant()` — every new tenant gets one automatically, regardless of
whether an owner was provided. A standalone `db:seed-walk-in-customer` CLI backfills pre-existing
tenants (mirrors `db:seed-owner`). `CustomersService.delete()` rejects deleting it.
`CustomerRepository` gained `findSystemDefault()` (Stage 3) — used by `PosSalesService.checkout()`
to resolve the Walk-in Customer when no `customerId` is given, and by the POS cart's own customer
`<Select>` (Stage 4) to omit the field entirely when the cashier leaves it on "Walk-in").

### 4. Checkout flow (Stage 3 backend BUILT; Stage 4 frontend BUILT)

**Key finding (unchanged from earlier passes):** COGS auto-posting (and inventory deduction) is
wired to the **Delivery confirmation** event, not Invoice posting. A naive "fast POS = Invoice +
Payment only" design would silently skip COGS and stock deduction. `PosSalesService.checkout()`
drives the full existing chain instead of bypassing it.

**Kysely nested-transaction blocker — found and fixed.** Confirmed directly against the installed
`kysely@0.29.5` source that `Transaction.transaction()` throws synchronously rather than opening a
savepoint. Fixed with a small shared helper, `withTransaction(db, callback)`
(`apps/api/src/database/tenant/transaction.util.ts`), swapped into the 7 existing
`db.transaction().execute(...)` call sites across Sales Orders/Deliveries/Sales Invoices/Payments
Received — behavior-preserving for every existing caller, and what makes `checkout()`'s outer
transaction actually atomic across all four documents.

**`pos_sessions.warehouse_id` (migration `0064`).** Per decision #7: nullable at the DB level,
application-required by `PosSessionsService.open()` going forward — and, since Stage 4, a required
field on the POS "open session" form (`<Select>` over `useWarehouses()`). `checkout()` reads it from
the session, never from the request body.

**Header-discount-into-invoice problem — found and resolved (decision #8).** Resolved with
`distributeOrderTotalAcrossLines()` (`sales-order.entity.ts`): splits the order's FULL total (line +
header discount, already combined) proportionally across its lines using the largest-remainder
method, so the sum of every line's target amount is EXACTLY `totalAmount` in minor units.

**`PosSalesService.checkout()`** (`application/services/pos-sales.service.ts`): validates
single-currency lines, computes the order total, validates tendered total up front; resolves the
customer (given, or Walk-in); then, in ONE outer `withTransaction(db, ...)`: create+confirm Sales
Order → create+confirm Delivery (from the session's warehouse) → create+post Sales Invoice (using
`distributeOrderTotalAcrossLines()`'s per-line net totals) → create+post one Payment Received per
tender, each allocated in full and tagged with the session's `pos_session_id`.

New endpoint: `POST /pos-sessions/:id/checkout`, contracts in
`libs/contracts/src/sales/pos-sale.contract.ts` (`posCheckoutSchema`, `posCheckoutResultSchema`).

**Frontend (Stage 4, BUILT) — the actual checkout screen.** New standalone route `/pos` (a sibling
entry in `salesRoutes`, not nested under `/sales`) and sidebar item (`nav.pos`, decision #9).
Branches on `GET /pos-sessions/current` (`useCurrentPosSession()`): no open session →
`<OpenSessionForm>` (warehouse + opening cash amount + notes); open session → the checkout screen
(`<PosCartPanel>`) plus a `<CloseSessionDialog>` and (Stage 5) a `<PosSessionReportDialog>` in the
header.

`PosCartPanel` (`components/pos/pos-cart-panel.tsx`): a plain-text product search over
`useProductsWithVariants()` (matches name/SKU/barcode — no Command/Popover/cmdk dependency added,
per "don't add a dependency without justification"; there is no sale-price field anywhere on
`ProductVariantDto`, so unit price is always entered manually per line, same as the Sales Order
manual line editor); a cart table reusing the same compact per-line discount UI as
`SalesOrderLineItemsEditor`; a header-level `<DiscountFields>`; an optional customer `<Select>`
(sentinel `__walk_in__` = omit the field, resolved server-side); a multi-tender editor (payment
method reusing `sales.paymentsReceived.paymentMethodValue.*`, amount, optional reference number);
and the single checkout action, which builds a `PosCheckoutDto` through the exact same
`resolveDiscountInput()`/`decimalToMinorUnits()` path the Sales Order form uses — never through the
running-total preview math (see below) — before calling `usePosCheckout()`.

`pos-totals.ts` computes a **non-authoritative live preview total** for the cart UI only (subtotal,
discounted total, tendered sum, remaining/change due) using plain floating-point number math on the
decimal-string drafts — deliberately not the app's BigInt Money helpers, since there's no
BigInt-safe way to multiply a minor-units amount by a fractional JS-number quantity without
reimplementing decimal arithmetic, and this value is only ever displayed, never submitted or
persisted. The authoritative totals always come back from the `checkout()` response
(`PosCheckoutResultDto`), same as `distributeOrderTotalAcrossLines()` on the backend.

**Why a shared `lib/` file (ESLint boundaries).** Once the POS cart needed the exact same discount
draft/resolve logic as the Sales Order form, importing it from
`components/pos/**` into `components/sales-orders/**` would have violated the
`.eslintrc.cjs` `boundaries/element-types` rule already enforced for every other Sales entity ("must
not import another entity's components directly — share logic through ... a shared file"). Resolved
by: (1) registering `sales-pos` as a new boundaries element (pattern
`apps/web/src/features/sales/components/pos/**`), symmetric with the other 8 Sales entities — each
now disallows importing from every sibling including `sales-pos`, and `sales-pos` disallows
importing from any of them; (2) moving `discount-fields.tsx` to `features/sales/lib/` — a
module-level shared file, sibling to `api/<entity>` and `hooks/<entity>`, matching the app-level
`lib/money.ts` precedent — so both `sales-orders` and `pos` import it from a location outside any
entity's `components/<entity>/**` boundary.

### 5. X/Z Session Report (Stage 5, BUILT)

**Key finding: no new column or migration needed.** Every POS `checkout()` call fully allocates
every one of its tenders to the single Sales Invoice it creates (Stage 3), and every one of those
`payments_received` rows is already tagged with the session's id (`pos_session_id`, migration
`0060`). That's enough to derive a session's sales figures without ever touching `sales_orders` or
`sales_invoices`: `KyselyPosSessionRepository.countAndSumSalesForSession()` joins
`payment_allocations` to this session's posted `payments_received` rows and returns
`COUNT(DISTINCT sales_invoice_id)` (never the number of payment rows — a single split-tender
checkout writes several) plus `SUM(allocated_amount_amount)`. `sumTendersByMethodForSession()`
groups this session's posted `payments_received` by `payment_method` for the payment breakdown.
Both follow the existing report-aggregation convention in this codebase (confirmed against
`accounting-reports.service.ts`'s own pattern): SQL-level `SUM()`/`COUNT()` via Kysely, wrapped into
`Money.fromMinorUnits()` exactly once per resulting row/group — never summed via floats, never
summed row-by-row in application code.

**`PosSessionsService.getReport(db, id)`** (decision #10 — one computation, one shape, for both X
and Z): loads the session, computes `salesCount`/`totalSalesAmount`/`tendersByMethod` from the two
methods above (identical either way), then branches only on `session.status` for the
cash-summary half: **open** → `expectedCashAmount` computed live via the exact same formula
`close()` uses (`openingCashAmount + sum(cash tenders)`, reusing
`sumCashTendersForSession()` unmodified) — `countedCashAmount`/`varianceAmount` are `null` (nothing
counted yet); **closed** → all three are read back from the session's own stored, immutable closing
figures (migration 0059's "a closed period's numbers are a historical fact" discipline) and never
recomputed. New endpoint: `GET /pos-sessions/:id/report`, read-only, safe to call any number of
times during a shift. Contract: `libs/contracts/src/sales/pos-session-report.contract.ts`
(`posSessionReportSchema`, `posSessionTenderTotalSchema`).

**Frontend.** `<PosSessionReportDialog>` (`components/pos/pos-session-report-dialog.tsx`), triggered
by a "عرض التقرير" button next to Close Session in the POS header — title switches between "تقرير
الجلسة (X)" and "تقرير إغلاق الجلسة (Z)" based on `session.status`, shows sales count + total, the
payment-method breakdown, opening/expected cash (and counted/variance once closed), a
`generatedAt` timestamp, and a manual refresh button (`usePosSessionReport()`'s `refetch()` — not
auto-invalidated by checkout, since it's an on-demand snapshot the cashier opens deliberately, not a
figure shown continuously on the cart screen).

## New document/field types requiring §17.3 approval — status: approved (user), all now BUILT

- `pos_sessions` entity (+ `warehouse_id`, Stage 3).
- `discount_type`/`discount_percentage`/`discount_fixed_amount` on Sales Order (header + line).
- `Cash Over/Short` GL account + its auto-posting rule.
- `is_system_default` flag + seeded Walk-in Customer row.
- `payments_received.pos_session_id` read/write path (Stage 3; column existed since Stage 1).
- Stage 5 needed none — see "Key finding: no new column or migration needed" above.

## Deliberately out of scope for v1

- Offline mode / local sync engine.
- Multi-terminal/multi-register session modeling.
- Receipt/thermal printer integration.
- Barcode hardware integration beyond keyboard-emulation.
- Gross sales before discount / total discounts given on the X/Z report (decision #11).

## Build stages — status

1. **`pos_sessions` backend + Cash Over/Short accounting listener — DONE.** Committed
   (`b3da02a`), pushed to GitHub.
2. **Walk-in Customer provisioning + discount fields (Sales Order header + line), backend — DONE.**
3. **`PosSalesService.checkout()` orchestration (Order→Delivery→Invoice→Payments, split-tender),
   backend — DONE.**
4. **POS frontend — DONE, verified (native checks passed).** Discount UI backfill across Sales
   Order forms/editor/details view, plus the full POS checkout screen (`/pos` route + sidebar item,
   session open/close, product search + cart, multi-tender checkout, live preview total). Required
   an `.eslintrc.cjs` change (new `sales-pos` boundaries element) and relocating
   `discount-fields.tsx` to `features/sales/lib/` — see "Why a shared `lib/` file" above.
5. **X/Z Session Report — DONE, this pass.** `PosSessionsService.getReport()`, two new repository
   methods (`sumTendersByMethodForSession`, `countAndSumSalesForSession`), `GET
   /pos-sessions/:id/report`, `pos-session-report.contract.ts`, and `<PosSessionReportDialog>`.
   **Verification done so far:** every touched/new file passed a `ts.transpileModule()`-based
   syntax check (backend files checked with `experimentalDecorators`/`emitDecoratorMetadata` on,
   matching Nest's own compiler config); the Kysely `count().distinct()` API used in
   `countAndSumSalesForSession()` was confirmed against the installed `kysely@0.29.5` type
   definitions before use (no prior precedent for `COUNT(DISTINCT ...)` existed in this codebase to
   copy from); every new `t('...')` key (including the two template-literal enum lookups) was
   cross-checked against `ar.json` and resolves. **Not yet done:** a real `pnpm
   typecheck`/`lint`/`build`/`test` run for this stage's files specifically — needs to be run
   natively by the user, same as every prior stage.

## Status

All 5 planned stages are now code-complete. Nothing has been committed yet — the user deliberately
deferred committing everything (Stage 2 onward) until the whole POS feature was finished, to land it
as one commit. Immediate next steps: the user runs native verification
(`pnpm typecheck`/`lint`/`build`/`test`) for Stage 5's new files, and once confirmed clean, the
accumulated Stage 2–5 work gets committed as a single commit (with the required attribution
footer) — nothing has been proposed or run yet for that commit.
