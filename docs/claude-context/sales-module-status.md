# Sales Module — Implementation Status

**Last updated:** 2026-08-30. Step 4 in CLAUDE.md §10's fixed build order. Two mandatory prerequisites completed first, per standing process: the ETA e-invoice technical spike (`claude/sales-einvoice-spike.md`, required by CLAUDE.md §8 before any Sales code) and a condensed competitor-research pass (`claude/sales-module-research.md`, CLAUDE.md §17.2).

## Status: backend fully done; frontend fully done for all 8 entities, including Sales Credit Notes (built this pass)

Backend has full parity with the master document's fixed entity list for this module (§10 [مستقر]) **plus** its own approved research-pass additions — Sales Returns (mirroring Purchases' RFQ/Purchase Returns precedent) and **Sales Credit Notes** (the financial counterpart to Sales Returns — see "Sales Credit Notes" below). Frontend, built earlier following the exact instruction "let's work on the frontend" ("يلا بينا نشتغل الفرونت"), covered the original 7 entities plus the `eta_credentials` settings screen; **this pass closes the one remaining gap** by adding the Sales Credit Notes frontend (read-only list/detail, matching the backend's own no-write design) and updating the Sales Returns confirm flow to surface the resulting credit note. **All 8 Sales entities now have complete backend + frontend.**

## Backend — done

### New this pass: Sales Credit Notes (the financial counterpart to Sales Returns)

Built as part of the same cross-module pass that added COGS and sales-return auto-posting to Accounting (see `claude/accounting-module-status.md`'s Stage 6/7 section for the full picture, including why it was needed and the Outbox/race-condition design that surrounds it). Resolves the decision flagged below under "Decisions made" item 1 and the "What's left" item about a financial credit-note mechanism — the user's explicit choice was "إشعار دائن مالي حقيقي" (a real financial credit note), not deriving a reversal amount by tracing back through invoice lines.

**Migration `0053_create_sales_credit_notes`**: `sales_credit_notes` (header: `credit_note_number` unique, `sales_return_id` unique FK → `sales_returns` — exactly one credit note per confirmed return, `customer_id` FK → `customers`, `currency`, `notes`, `custom_fields`) + `sales_credit_note_lines` (`sales_credit_note_id` FK CASCADE, `sales_return_line_id` FK → `sales_return_lines` RESTRICT, `product_variant_id`, `quantity NUMERIC CHECK > 0`, `unit_price_amount BIGINT` + `unit_price_currency TEXT`, same Money-storage convention as every other line table in this codebase).

**Always auto-generated, never user-created.** `SalesReturnsService.confirm()` now creates the credit note itself, inside the same transaction as the return's status flip — there is deliberately no `POST /sales-credit-notes`, no create Zod schema at all, and no status/lifecycle field. It's a one-way-door financial fact, not a document someone drafts and edits. Read-only via `GET /sales-credit-notes` (optional `?salesReturnId=` filter) and `GET /sales-credit-notes/:id`, gated `sales.manage`, same permission as everything else in this module.

**Pricing**: captured from the **original `sales_order_line.unitPrice`**, traced `sales_return_line → delivery_line → sales_order_line` via `Map`-based lookups over `listByDeliveryId`/`listBySalesOrderId` results (neither `DeliveryLineRepository` nor `SalesOrderLineRepository` exposes a `findById`, so this reuses the same list+Map pattern already established in `SalesReturnsService.create()` rather than adding one). Deliberately **not** traced through whatever Sales Invoice(s) happen to cover the sale — invoicing status isn't always well-defined at return time (an order can be partially invoiced, invoiced under a different price override, or not invoiced yet at all), so the original order-line price is the one unambiguous source.

**`SalesReturnsService.confirm()` rewritten** to accept `(db, id, schema, actorUserId)` and, inside one `db.transaction()`: flip the return to `confirmed`, create the credit note (and its lines) via `SalesCreditNotesService.createFromSalesReturn()`, then write **two** outbox events — `sales.sales_return.confirmed` (existing, unchanged, plain — Inventory's stock-restoration listener still reacts to it exactly as before) and the new `sales.sales_credit_note.issued` (Outbox-backed — this is the one Accounting's new auto-posting listener reacts to, carrying the credit note's total amount). `SalesReturnConfirmation` (the DTO returned by `confirm()`) now also carries `creditNoteId`.

**Contracts**: `salesCreditNoteLineSchema`, `salesCreditNoteSchema`, `salesCreditNoteWithLinesSchema` in `libs/contracts/src/sales/sales-credit-note.contract.ts` — no create schema, matching the no-user-creation design. `salesReturnConfirmationSchema` (`salesReturnWithLinesSchema.extend({ creditNoteId: z.string().uuid() })`) added specifically for the `confirm()` response, used only there.

### Prior pass: Sales Returns + gap closure, ETA deferred

Per the user's explicit instruction: build Sales Returns, close the known backend gaps, defer all e-invoice/ETA work. Three things happened:

1. **Sales Returns (Stage 7) — built.**
2. **Payments Received's "allocate later" gap — closed.** A new `allocate()` action/endpoint lets an already-*posted* payment's unallocated remainder be applied to additional sales invoices after the fact.
3. **PlanFeatureGuard — investigated, found to be a bigger gap than "just apply it", not built.** Flagged rather than silently built, per CLAUDE.md's own rule to stop and ask when something would require inventing new architecture.
4. **`gs1_code`/`egs_code` column and the ETA submission engine — deliberately untouched**, per the explicit instruction to defer everything ETA-related.

### Why eta_credentials exists this early, and what it deliberately does not do

The user asked explicitly to get e-invoice readiness in place now, despite not having real ETA registration data yet (registering requires a real Egyptian taxpayer entity — TIN/RIN — which this session cannot obtain on its own; see the spike doc's §7). The resolution: build the **credential storage and readiness**, not the **submission engine**. `eta_credentials` lets a tenant admin register their client_id/client_secret/TIN and flip `isEnabled` on as soon as they have real ones — but **no code anywhere calls the ETA API**. The actual submission engine (state machine, `ESealSigner` port, background dispatcher — spike doc §6) stays deferred.

### PlanFeatureGuard: why this wasn't closed

Every controller across Inventory/Purchases/Sales carries a comment reading "No PlanFeatureGuard yet — same deliberate, tracked gap...". Investigating what it would take to close this turned up something more significant than applying an existing-but-unused guard: **no `PlanFeatureGuard` class exists anywhere in this codebase**, and more fundamentally, **no plan/feature/subscription data model exists at all** — confirmed directly by reading `apps/api/prisma/schema.prisma` (the public/platform schema), whose own header comment states: *"Full platform/plan/signup modeling is explicitly out of scope for this task."*

Building a real `PlanFeatureGuard` first requires designing that missing layer: a `Plan`/`Feature` model in the public schema (Prisma), a `Tenant.planId` relationship, a service resolving "does this tenant's plan include feature X", and only then a NestJS guard reading route metadata against it. Per CLAUDE.md rule 11, this was flagged rather than built. This still needs its own conversation about what a plan actually looks like (free/paid tiers? per-module add-ons? tied to a specific billing provider?) before any code gets written — **frontend PlanFeatureGuard enforcement is correspondingly also not built**, since there is nothing yet to enforce.

### Stage 7 — Sales Returns (done; financial side added a prior pass — see Sales Credit Notes above)

The approved research-pass addition (`claude/sales-module-research.md`) — the mirror image of Purchases' Purchase Returns, with the stock direction flipped: a purchase return sends stock **out** back to a supplier; a sales return brings stock back **in** from a customer. Tied to exactly one `delivery`, same as Purchase Returns being tied to one goods receipt. Same two-step shape as every document in this module: `create()` validates a `draft`, `confirm()` is the one-way door, publishing `sales.sales_return.confirmed` on the plain Event Bus (unchanged — a stock increase isn't itself a financial event) **and now also** creating a Sales Credit Note and publishing the Outbox-backed `sales.sales_credit_note.issued` (see above). Does **not** reopen the parent sales order's delivered status. **The original "physical/operational return only — no financial credit note" scope boundary from this stage's first pass is now superseded** — see "Decisions made" below.

### Gap closed — Payments Received: allocate an existing payment's remainder later

`PaymentsReceivedService.allocate()` + `POST /payments-received/:id/allocate`. Only works on an already-**posted** payment. Writes its own `sales.payment_received.allocated` outbox record, atomic with the new `payment_allocations` rows (CLAUDE.md §2.7).

## Verification status — backend

**Native verification is now done — see `claude/accounting-module-status.md`'s "Verification status" section.** `pnpm typecheck`/`lint`/`build`/`test` were all run live by the user on their own machine (2026-08-30) and passed cleanly — 294/294 tests, 34/34 suites, exercising the whole repo including Sales. Two Sales-module lint fixes came out of that pass (both pre-existing, unrelated to this module's own feature work): `delivery-line.repository.ts` had an unused `CreateDeliveryLineInput` import (removed), and `payment-received-form.tsx` had an unused `currency` variable from `form.watch('currency')` (removed, after confirming `useCustomerInvoices` doesn't filter by currency and the real currency used downstream is `values.currency` from RHF state). Prior to that pass, backend verification for this module relied on the device-bridge session's manual comment/string-aware brace/paren/bracket balance check plus relative-import path resolution (96+13 backend files clean) — that manual method is now superseded by the real native run. No backend tests written — same explicit, standing deferral as Purchases.

## Frontend — done (all 8 entities, including Sales Credit Notes as of this pass)

Started per the user's explicit instruction ("يلا بينا نشتغل الفرونت" — "let's go, let's work on the frontend"), once the backend was code-complete. Follows Purchases' post-redesign frontend conventions exactly as the template (route-per-entity via React Router with lazy loading, per-entity `api/<entity>/queries.ts` + `components/<entity>/{index.ts, <entity>-page.tsx, <entity>-tab.tsx, <entity>-form.tsx, ...}` folders, `hooks/<entity>/*.ts` for composed bulk-lookup/variant-index hooks, `<DataTable>` (TanStack Table) for list views, shared `<Can>` permission gating, dynamic custom-fields form engine via `useCustomFieldDefinitions(entityType)`, `lib/api-client.ts`/`lib/money.ts` reused as-is, RTL/Arabic-first i18n via `t('sales...')` keys).

Confirmed before building, by reading each backend service/contract directly rather than assuming from Purchases' shape: Sales Orders' dual-creation-path validation (`sourceQuotationId` XOR `customerId` + `lines`, `SalesOrdersService.create()`), the exact eligible-status filters for creating a Delivery (SO `confirmed`/`partially_delivered`), a Sales Invoice (SO not `draft`/`cancelled`), and a Sales Return (delivery `confirmed`), and which entities have no `update()` at all (Deliveries, Sales Invoices, Payments Received's line-level edit, Sales Returns).

### Customers (done)

Simplest entity — plain CRUD, no line items, no Money, closest structural analog to Purchases' Suppliers. `api/customers/queries.ts` (`useCustomers`, `useCustomer`, `useCreateCustomer`, `useUpdateCustomer`, `useDeleteCustomer`); `components/customers/{index.ts, customers-page.tsx, customers-tab.tsx, customer-form.tsx}`. No `hooks/customers/` needed — no cross-entity derived data.

### Quotations (done)

First line-item entity in Sales. Freeform add/remove Money-carrying line editor (`quotation-line-items-editor.tsx`), same non-`useFieldArray` split (header via react-hook-form, `lines` via separate `useState`, merged by hand in `onSubmit`) established in Purchases. `EditQuotationForm` only edits header fields + lines — `customerId` is fixed on edit, matching `QuotationsService.update()`'s `existing.status !== 'draft'` guard (confirmed by reading the backend service directly). Full status workflow surfaced: `draft → sent → accepted|rejected`, plus `cancelled`, via a shared `useStatusTransition(action)` hook factory hitting `POST /quotations/:id/{action}`.

### Sales Orders (done)

**The first Sales entity with two mutually-exclusive creation paths**, mirroring Purchase Orders' `CreatePurchaseOrderTabs` pattern exactly: `CreateSalesOrderTabs` wraps `CreateSalesOrderFromQuotationForm` (header only, read-only lines preview from `useQuotation(selectedQuotationId)`) and `CreateSalesOrderManualForm` (customerId + freeform lines). New composed bulk-lookup hook `useEligibleQuotations` — simpler than Purchases' analog since `GET /quotations` has no required filter, so no RFQ-style fan-out is needed; it just filters `status === 'accepted'` quotations not already referenced by any sales order's `sourceQuotationId`. Confirmed directly against `salesOrderSchema` that there is no `expectedDeliveryDate`-equivalent header field (simpler header than Purchase Orders — only `notes`). Status workflow: `draft/confirmed/partially_delivered/fully_delivered/cancelled`.

### Deliveries (done)

**First worksheet-shaped line editor in Sales**, mirroring Purchases' Goods Receipts: one fixed row per outstanding sales-order line (product, ordered, delivered, remaining, a quantity-to-deliver input), rows left at 0 excluded on submit. No Money at all — `deliveryLineSchema` confirmed to carry no unit cost. New composed hook `useSalesOrderRemaining` (confirmed deliveries → sum delivered qty per SO line, two-level `useQueries` fan-out) — client-side convenience only, backend re-validates independently. No edit form — `DeliveriesService` has no `update()`. Deliverable orders: SO status `confirmed` or `partially_delivered` (confirmed via `DeliveriesService.create()`'s exact check, not assumed from Goods Receipts' filter). Confirming a delivery invalidates `['sales-orders']` too, since confirming recomputes the parent SO's status server-side.

### Sales Invoices (done)

**First real Money worksheet in Sales**, mirroring Purchases' Purchase Invoices: one fixed row per invoiceable SO line (product, ordered, remaining, quantity-to-invoice input, optional per-line unit-price override defaulting to the SO line's own price — confirmed via `createSalesInvoiceLineSchema.unitPrice.optional()`). New composed hook `useSalesOrderInvoiceable` (posted invoices → sum invoiced qty per SO line). Invoiceable orders: any status except `draft`/`cancelled` — deliberately wider than Deliveries' filter, since invoicing tracks an independent "already invoiced" ledger from "already delivered" (confirmed by reading `SalesInvoicesService.create()` directly). **No `supplierInvoiceNumber`-equivalent field** — `createSalesInvoiceSchema` has no such field, unlike Purchase Invoices. No edit form. Status: `draft/posted/cancelled`; "post" (not "confirm") terminology and a one-way-door warning in the confirm dialog, matching the backend's Outbox-backed `post()`.

### Sales Returns (done — now surfaces the resulting credit note, this pass)

Worksheet against the selected delivery's own lines (delivered, returned, remaining), plus a free-text `reason` field, no Money at all — matches Purchase Returns' "not a financial credit note" precedent (`salesReturnLineSchema` confirmed to carry no cost). New composed hook `useDeliveryReturnable`. Returnable deliveries: status `confirmed` only. No edit form. Status: `draft/confirmed/cancelled`, confirm dialog warns it increases stock.

**Closed this pass**: the confirm flow now surfaces the resulting Sales Credit Note. `useConfirmSalesReturn()` (`api/sales-returns/queries.ts`) is now typed on the real `SalesReturnConfirmationDto` response (was narrowed to plain `SalesReturnDto` before) and, on success, also invalidates `['sales-credit-notes']` so the new credit note shows up immediately in its own list. `SalesReturnsTab`'s confirm handler shows a dedicated toast (`sales.salesReturns.confirmSuccessWithCreditNote`) instead of the generic confirm message. `SalesReturnDetailsView` now fetches the linked credit note via `useSalesCreditNotesBySalesReturn(salesReturn.id)` and, once one exists (i.e. the return is `confirmed`), shows its `creditNoteNumber` as a new header field (`sales.salesReturns.creditNote`) — a plain reference field, not a deep link, since credit-note details are dialog-based (no per-record route) same as every other entity in this module.

### Payments Received (done)

**The most structurally novel entity in the Sales frontend** — unlike every other entity, there is no single parent document whose lines cap what can be allocated. Built a new **two-level fan-out hook**, `useCustomerInvoices(customerId)`: customer's sales orders → invoices per SO (fanned out) → filter `status === 'posted'` → per-invoice detail fetch (a second fan-out) for `totalAmount`. **Explicitly documented limitation, carried into the code comments:** no endpoint exposes per-invoice already-allocated amount from *other* payments, so the frontend cannot compute or enforce a true per-invoice outstanding balance — `PaymentAllocationEditor` shows each invoice's `totalAmount` as a reference-only figure and caps only the *payment's own* total/`unallocatedAmount` client-side, leaving true per-invoice validation entirely to the backend's `validateAllocations()`. `CreatePaymentReceivedForm` auto-syncs the `currency` field to the selected customer's `defaultCurrency` on selection (independently editable after). A separate `AllocatePaymentReceivedForm` dialog reuses `PaymentAllocationEditor` for the new `allocate()` backend action (posted payments only), consistent with the "allocate later" gap closed on the backend this module. Status: `draft/posted/cancelled`; actions gated per status (post: draft only; allocate: posted only; cancel: draft only; delete: draft/cancelled).

### ETA Credentials (done — config storage only, per the standing exclusion)

Own routed page at `/sales/eta-credentials` (not nested inside global Settings, since it's Sales-module-owned config — confirmed by reading `EtaCredentialsController`'s doc comment: "Settings-shaped singleton, same as `TenantSettingsController`", reusing the `sales.manage` permission), structurally modeled on Settings' `GeneralTab` (singleton Card + Form, GET + PATCH only, no list/create/delete). Fields: `clientId`, `clientSecret` (password input, always starts blank; a blank field on submit is converted to `undefined` in the PATCH body, meaning "leave unchanged" — never overwrites a stored secret with an empty string), `taxRegistrationNumber`, `environment` (preprod/production), `documentVersion`, `isEnabled`, plus a badge showing whether a secret is currently configured. **Carries an explicit doc comment stating this is credential-storage readiness only, and is NOT the ETA submission engine** — no code on this page or anywhere in the frontend calls the ETA API, matching the standing instruction to defer all e-invoice work.

### Sales Credit Notes (done, this pass — the 8th and final Sales entity)

**Fully read-only, matching the backend controller exactly** — `SalesCreditNotesController` has no `@Post`/`@Patch`/`@Delete` at all (a credit note is always auto-generated by `SalesReturnsService.confirm()`, never a document a user drafts), so unlike every other entity in this module there is no create/edit form, no status badge, and no lifecycle actions anywhere in this stage. The tab is a plain master list (`GET /sales-credit-notes`, unscoped — no required filter, same shape as Purchase Returns/Goods Receipts) with a single "view details" action per row opening a read-only dialog.

- `api/sales-credit-notes/queries.ts` — `useSalesCreditNotes()` (unscoped list), `useSalesCreditNotesBySalesReturn(salesReturnId)` (scoped `?salesReturnId=`, used by `SalesReturnDetailsView` to link back to the credit note a confirmed return generated), `useSalesCreditNote(id)` (detail, `SalesCreditNoteWithLinesDto`).
- `hooks/sales-credit-notes/use-variant-index.ts` — same per-entity product/SKU lookup pattern as every other entity's own copy.
- `components/sales-credit-notes/{index.ts, sales-credit-notes-page.tsx, sales-credit-notes-tab.tsx, sales-credit-note-details-view.tsx}` — list columns: credit note number, customer name (via `useCustomers()` lookup), linked sales return number (via `useSalesReturns()` lookup), issue date. Details view: header (credit note number, customer, linked return, `totalAmount` via `formatMoney()`, notes) + a read-only lines table (product/SKU, quantity, unit price) — `totalAmount` is server-computed on every `GET /sales-credit-notes/:id` and rendered as-is, never summed client-side, matching Quotations/Sales Invoices' own precedent.
- Routed at `/sales/sales-credit-notes`, added to `nav-items.ts` between Sales Returns and ETA Credentials.

### Shared wiring

- `apps/web/src/features/sales/routes.tsx` — 9 lazy-loaded routes under `/sales` (8 entities + `eta-credentials`), index redirects to `customers`. Doc comment updated this pass to list all 8 entities including Sales Credit Notes.
- `apps/web/src/app/router.tsx` — spreads `salesRoutes` after `purchasesRoutes`.
- `apps/web/src/app/layout/nav-items.ts` — top-level `/sales` nav entry (permission `sales.manage`) now has 9 children, between `/purchases` and `/users`.
- `.eslintrc.cjs` — widened this pass with a new `sales-sales-credit-notes` boundary element type, added to the shared-kernel/contracts/UI disallow list and the `app-web` rule's `from` array, plus a new mutual-exclusion rule block (`sales-sales-credit-notes` disallowing the other 7 Sales entities, and all 7 existing Sales rule blocks updated to disallow `sales-sales-credit-notes` too). Reloaded via `node -e "require('./.eslintrc.cjs')"` to confirm valid JS: **26 elements** (25 prior + 1), **24 rules** (23 prior + 1).
- `apps/web/src/i18n/locales/ar.json` — `sales.tabs.salesCreditNotes` + full `sales.salesCreditNotes.*` tree added this pass, plus two new keys on the existing `sales.salesReturns` namespace (`confirmSuccessWithCreditNote`, `creditNote`). Edited via `json.load`/`json.dump` to guarantee valid JSON.

## Verification status — frontend

**Native verification is now done — see `claude/accounting-module-status.md`'s "Verification status" section.** `pnpm typecheck`/`lint`/`build`/`test` all pass cleanly as of 2026-08-30, run live on the user's own machine. Prior to that, this device-bridge session's manual method (comment/string-aware brace/paren/bracket balance + relative-import resolution across all touched files, `ar.json` re-parsed as valid JSON, every `t('sales...')`/`labelKey:` call regex-extracted and resolved against the actual key tree, `.eslintrc.cjs` reloaded under Node to confirm boundary-rule counts) had all come back clean — that manual verification is now superseded by the real native pass, which found and fixed two small pre-existing lint issues in this module (see "Verification status — backend" above).

## Decisions made (flagged, not invented silently)

1. ~~Sales Returns is physical/operational only — no financial credit note.~~ **Superseded** — the user was asked directly and chose the real-financial-credit-note design ("إشعار دائن مالي حقيقي"). Sales Credit Notes (backend + frontend, including the Sales Returns confirm-flow link) is now fully built.
2. **PlanFeatureGuard was investigated and explicitly NOT built**, backend or frontend — it requires a plan/subscription/feature data model that doesn't exist anywhere in this codebase and is explicitly marked out of scope in `schema.prisma`'s own header comment. See "PlanFeatureGuard: why this wasn't closed" above.
3. **e-invoice submission engine and `gs1_code`/`egs_code` — untouched**, per the user's explicit instruction to defer everything ETA-related. The ETA Credentials frontend screen is config-storage UI only.
4. **Payments Received's per-invoice outstanding balance cannot be computed or enforced client-side** — no endpoint exposes per-invoice already-allocated amounts from other payments. The frontend caps only the payment's own total/unallocated amount and documents this limitation inline; true validation is backend-only.
5. Everything decided in prior backend stages stands unchanged — see below for the running list.

Carried forward from earlier stages: `customerType` added ahead of its consuming feature (CLAUDE.md §17.2.3); secrets-at-rest is AES-256-GCM with an env-var key, not a real KMS (flagged in the spike doc); Sales Orders' status enum was extended in a second migration once Deliveries existed to justify it; Sales Invoice lines reference `sales_order_line_id`, not `delivery_line_id`; Payments Received is genuinely in the master doc's Sales entity list unlike Purchases; payment allocations are validated against invoice balance and currency with no multi-currency conversion anywhere in this codebase.

## What's left

- **The actual ETA submission engine** — still not built, still blocked on signing strategy and real ETA preprod credentials, and explicitly untouched per the user's instruction. Backend and frontend both.
- **`gs1_code`/`egs_code` column on `product_variants`** — untouched, same reason.
- **PlanFeatureGuard, and the plan/subscription data model it depends on** — needs a real design conversation (what tiers/features/billing model), not a code fix.
- **Native verification** — **done as of 2026-08-30**, see `claude/accounting-module-status.md`.
- **No tests written anywhere in this module** (backend or frontend) — explicit, standing deferral matching Purchases.
- **Operational note (not a code gap):** numbering sequences need to be configured (via Settings) for every document type Sales issues (`quotation`, `sales_order`, `delivery`, `sales_invoice`, `payment_received`, `sales_return`, and `sales_credit_note` — each with its own `NumberingSequencesService` document type, including credit notes despite being auto-generated).

## Next

**The Sales module is now fully done — backend and frontend, all 8 entities, and native verification is also confirmed passing (see `claude/accounting-module-status.md`).** No Sales-specific work remains except items already flagged as blocked-on-the-user (ETA signing/credentials, PlanFeatureGuard's underlying plan-model design) or explicitly deferred (tests). Per CLAUDE.md §10's fixed build order, Inventory → Purchases → Sales → **Accounting** are all now backend-and-frontend complete — see `claude/accounting-module-status.md`. The only remaining item across the whole platform's fixed build order is Accounting's own Stage 8 (Tax Returns), which needs its own dedicated research pass first.
</content>
