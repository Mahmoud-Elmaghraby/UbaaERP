# Inventory module audit — 2026-10-06

Module-by-module hardening pass (user's approach: treat each module as if it were the only one, list its problems, fix them). Inventory first. Code read on commit f3ca091 (UI redesign branch). Backend + frontend audited separately; the two critical backend claims (no row locking; listeners swallow errors) were spot-verified by hand.

## Backend — critical
- **C1 Race conditions on stock/cost.** Read-modify-write with plain SELECT, then absolute `quantity_on_hand = <value>` upsert (`kysely-stock-level.repository.ts:70-76`); no `FOR UPDATE` anywhere in inventory; same for lots and landed costs. Two concurrent movements on the same variant/location lose one update (stock and average cost).
- **C2 Lot/serial-tracked items never enter stock from documents.** Goods receipt / delivery / return lines have no lot/serial/expiry fields; listeners send movements without lot → service throws `TRACKING_LABEL_REQUIRED` → swallowed. PO shows fully received, stock stays 0.
- **C3 Stock listeners swallow every error** (`delivery-stock.listener.ts:163`, goods-receipt, purchase-return, sales-return). Outbox marks the event processed → no retry, no record. With negative stock always blocked, a POS sale of not-yet-received goods silently skips the stock decrease and COGS.

## Backend — high
- H1 No idempotency on listeners (no unique (reference_type, reference_id, line) on stock_movements) → retry after a failed markProcessed moves stock twice; per-line transactions allow partial application.
- H2 Foreign-currency goods receipts pass the PO-currency cost to inventory unconverted → level valued in USD, later EGP receipts fail with CURRENCY_MISMATCH (swallowed). Confirms the open question from the multi-currency work.
- H3 Product unit_of_measure and tracking_type editable after stock exists → quantities change meaning / stock frozen.
- H4 Same serial can be received twice (qty 2 on one serial).
- H5 Landed cost applied wholly to remaining stock even if most of the receipt was sold; no idempotency; no accounting event.
- H6 Manual movements, opening stock, transfers, landed costs post nothing to Accounting → stock valuation and GL inventory account drift.
- H7 Negative unit cost accepted (contract regex `^-?\d+$`).

## Backend — medium/low
FEFO doesn't skip expired lots; average cost stored in whole piastres (precision loss for cheap items); returns use current average not original cost; documents only use the DEFAULT location; inactive product/location/warehouse not blocked; units only on manual movements (no carton/piece on purchase/sales lines); single `inventory.manage` permission for everything; `updated_at: new Date()` in 7 repositories; unhandled FK error on product/unit delete → 500; reorder point only on existing stock rows; no variant update endpoint (barcode not editable). Tests: unit tests with mocks only; none for listeners, concurrency or integration.

## Frontend
- Critical: N+1 — `useProductsWithVariants` fires one GET per product (1,000 products ≈ 1,000 requests, repeated after 30 s staleTime); product pickers are unsearchable Selects listing everything; product attributes input deletes typed commas and ignores the Arabic comma "،".
- High: no barcode for simple products; stock filters can't be cleared; delete of used product/warehouse → generic error; unit/tracking editable after stock; unit cost labelled optional but required for "in"; Arabic digits rejected by money parser with a vague toast; serials received one per dialog; movement history capped at 100, no item card.
- Medium: date columns sort as localized strings; no quantity formatting/units/stock value; reorder point unused; unit list not limited to the product; units global not per product; inactive records in pickers; landed-cost flow picks raw movements, no preview; DataTable fixed 10 rows/page.
- Missing screens: stock valuation, item card (كارت الصنف), low-stock list, stocktake (جرد), opening stock entry, Excel export/print, barcode labels, bulk import.

## Proposed fix plan (approved — executing step by step)
1. Stock integrity: row locks / atomic updates, stop swallowing + idempotency, block or allow-negative setting, immutable unit/tracking after movements, serial uniqueness, non-negative cost, updated_at fix, FK delete → clear 409 + deactivate.
2. Daily-use UX: variant lookup endpoint (kill N+1), searchable product picker (name/SKU/barcode), attribute input fix, barcode on simple products + variant edit, clearable filters, required cost for "in", Arabic digits, page size options.
3. Reports & operations: item card with running balance, stock valuation by warehouse, low-stock list, opening stock (bulk), stocktake with variance, Excel export.
4. Cross-module correctness: currency conversion on receipts, lots/serials on receipt/delivery/return lines, GL postings for adjustments/opening/landed cost, landed cost allocation fix, cost precision.

## Step 1 status — DONE (2026-10-06, cloud commit ad424ff on branch inventory-integrity; delivered to M:\Projects\erp-platform, checksums verified; user to commit/push)
- **New critical finding fixed:** `DeliveryStockListener` / `SalesReturnStockListener` opened `db.transaction()` and then called `recordMovement(trx)`, which called `trx.transaction()` — Kysely 0.29 always throws there, and the try/catch swallowed it. **Every confirmed delivery (incl. POS sales via sales invoices) never decreased stock and never emitted COGS.** Reproduced by an integration test, now fixed (`withTransaction` joins the caller's transaction).
- C1 fixed: per-variant `pg_advisory_xact_lock` (sorted, re-entrant) in `StockLevelRepository.lockVariants`; used by recordMovement, transferStock, landed costs and document listeners. Integration test: 8 parallel receipts → 8 (was 1); 8 parallel sales of 5 in stock → 5 succeed (was 8, oversold).
- C3/H1 fixed: the 4 stock listeners apply all lines in one transaction, skip if `stock_movements` already has the (reference_type, reference_id), and rethrow so the outbox retries. Purchase-return confirm moved to the outbox (was a post-commit plain publish).
- H3 (unit/tracking locked after movements), H4 (serial already in stock), H7 (negative cost: contract + service) fixed. Currency reset allowed at qty 0. FK delete on product/unit/warehouse → 409 with Arabic messages. `updated_at` → DB `now()` in all inventory repos.
- Tests: `apps/api/test/integration/stock-integrity.int-spec.ts` (10 tests, real Postgres) + product guard unit tests; 293 unit tests pass.
- Still open from step 1 area: delivery/purchase-return with insufficient stock now ends as a failed outbox row (visible, all-or-nothing) — a synchronous availability check at confirm time and a UI for failed outbox events are follow-ups. C2 (lots on document lines), H2 (FX), H5, H6 remain for steps 2/4.

## Step 2 status — DONE (2026-10-06, cloud commit 34793f2; delivered to M:\Projects\erp-platform, 61 files, checksums verified; user to `pnpm install` then commit/push)
- N+1 removed: `GET /product-variants` returns the whole catalogue as flat rows (product name/code, SKU, barcode, unit symbol, tracking, active flags) in one query. Every `use-variant-index` hook, line editor, stock form and POS now uses it (`useVariantLookup`); `useProductsWithVariants` deleted.
- Permission fix: the catalogue was only readable with `inventory.manage`, so sales/purchase users couldn't load products. New `RequireAnyPermission` (guard + spec); the lookup accepts inventory/sales/purchases manage.
- Shared searchable picker: `Combobox` + `Popover` in libs/ui (new dep `@radix-ui/react-popover`, same Radix family), `ProductVariantPicker` in `apps/web/src/components/product`. Search folds Arabic spelling (أ/إ/آ→ا, ة→ه, ى→ي, diacritics) and Arabic digits; exact barcode/SKU/code ranks first so scan + Enter selects. Verified in a browser with mocked API.
- POS: Enter in the search box adds the exact barcode/code match (scanner flow).
- Barcodes: barcode at product creation for simple products; `PATCH /products/:id/variants/:variantId` (SKU, barcode, option values, active) + edit form; duplicate barcode → `PRODUCT_VARIANT.DUPLICATE_BARCODE` 409.
- Fixes: attributes input (commas were swallowed; Arabic comma now accepted), money parser accepts Arabic digits/separators, unit cost required for "in", clearable stock filters, table page-size selector.
- Still open for step 2 polish: date columns sort as localized strings; quantity formatting/units in stock tables; reorder point unused.

## Step 3a status — DONE (2026-10-06, cloud commit 4e1f490; delivered, 66 files, checksums verified; needs `prisma`-free `pnpm --filter api run migrate` style tenant migration run — new migration 0075)
User chose "rebuild the product" next (over lots/expiry and reports). Competitor reference: Daftra multi-barcode & per-unit barcodes (docs.daftra.com/en/?p=4773, ?p=8590), Odoo product code sequence (apps.odoo.com to_product_code_sequence).
- Migration 0075: `inventory_settings` (item_code_mode manual/auto, barcode_mode manual/auto, barcode_prefix default '2' = GS1 in-store range), `product_categories` (tree), `product_brands`, products + item_type (stock/service), category_id, brand_id, sale/purchase price (Money pairs, non-negative), tax_rule_id.
- Auto item codes via numbering_sequences 'product' (created on demand as ITM-00001 through new `NumberingSequencesService.ensureTenantWide`); auto EAN-13 with check digit via 'product_barcode' counter, collision-checked against typed codes. SKU optional everywhere (defaults to code, then code-2, code-3…).
- Service items never move stock (StockMovementsService guard + listeners skip their lines) — fixes service lines on invoices failing as "insufficient stock".
- UI: Settings › Modules › إعدادات المخزون; new page المخزون › التصنيفات والماركات; product form gets item type / category (searchable tree) / brand / tax / sale & purchase price; code optional in auto mode; products list shows category + sale price with a category filter (includes sub-categories); default price prefills sales/purchase lines and POS.
- Tests: product-master-data.int-spec (5) + service-item delivery test; 303 unit tests pass.
- Note: go-live gap spotted — document numbering sequences (sales_invoice etc.) are never seeded; a new tenant gets a raw 500 on its first invoice until it creates them. `ensureTenantWide` now exists to fix this cheaply.
- Next (step 3b): multiple units per product (carton/piece with own price & barcode), multiple barcodes per variant, size×colour variant matrix generator, barcode label printing, scale barcodes.

## Step 3b part 1 status — DONE (2026-10-06, cloud commit after 85000bf; delivered, 31 files, checksums verified; needs `db:migrate` for 0076)
- `product_barcodes` (migration 0076): alternate + pack barcodes per variant (`quantity` = base units per scan, e.g. carton = 12), unique across primary and extra codes (service-checked both ways). Endpoints GET/POST/DELETE /products/:id/variants/:variantId/barcodes. Lookup carries `extraBarcodes`.
- Variant matrix: POST /products/:id/variants/generate {options} → all missing combinations (max 300), auto SKU code-2…, auto barcode in auto mode; re-runnable.
- Scale barcodes: inventory_settings scale_* columns (prefix, item-code length, weight|price, decimals; layout validated so the value keeps ≥3 digits). POS `resolveScan`: primary → pack (adds N) → SKU/code → scale (weight = qty, price ÷ sale price). GET /inventory-settings now readable by sales/purchases too.
- Barcode labels page (المخزون › طباعة الباركود): 38×25 / 50×30 thermal roll (one label per page via @page) or A4 3-column; dependency-free EAN-13 + Code 128 SVG (`apps/web/src/lib/barcode.ts`) — verified by rendering and decoding with zbar, and the printed PDF label decodes at 38×25 mm.
- Still open for step 3b part 2: units on document lines (sell/buy by carton with its own price) — cross-module (sales/purchases line tables + listeners), needs its own pass.

## Lots, expiry & serials on documents — DONE (2026-10-06, cloud commit 00f79c9 on base 7121930; delivered, 48 files, checksums verified; needs `db:migrate` for 0077)
User chose this next (over units on document lines and reports). Closes audit finding C2 and the "FEFO doesn't skip expired lots" item.
- Migration 0077: `lot_allocations JSONB` on goods_receipt_lines and delivery_lines; index on stock_lots.expiry_date.
- Purchases: goods receipt lines carry `lots [{lotNumber, expiryDate, quantity}]`; lot/serial-tracked items MUST have lots adding up to the received quantity (serial = qty 1 each, no duplicates); untracked items must not. The tracking type is read through a small read-only port (`ProductTrackingReader`, same FK-read precedent). The purchase invoice passes lots to the goods receipt it auto-creates when Goods Receipts is off (direct-invoice UI supports it; PO-based invoice UI doesn't yet).
- **Bug fixed along the way:** `GoodsReceiptsService.create` and `PurchaseOrdersService.create` used `db.transaction()`, and the purchase invoice calls them with an open trx → Kysely throws. So direct purchase invoices, and invoices with Goods Receipts off, could not be created at all. Both now use `withTransaction`; an integration test covers it.
- Inventory listeners:
  - Goods receipt: one 'in' movement per lot.
  - Delivery: picked lots, or FEFO that skips expired lots; selling an expired lot is refused with `LOT_EXPIRED` / `INSUFFICIENT_UNEXPIRED_STOCK`.
  - Purchase return: takes back the original receipt's lots first, expired lots allowed.
  - Sales return: refills the lots the delivery took (`lotsMovedByReference`).
  - Tracked items always move one movement per lot, so serials with qty > 1 on a document now work (they used to fail).
- New `GET /stock/expiring-lots?withinDays=` endpoint and page المخزون › تقرير الصلاحية (window, warehouse, expired value). `GET /stock/lots` is now readable by sales and purchases users too, for the delivery lot picker.
- UI:
  - Lot/expiry rows or a serials textarea (one per line, Arabic digits OK) under tracked lines on goods receipts and direct purchase invoices.
  - Optional lot picker on deliveries, showing expiry and availability; expired lots are struck through and disabled.
  - Lots shown on goods receipt and delivery details.
  - Verified in a browser with a mocked API (POST bodies checked).
- Tests: `document-lots.int-spec.ts` (10 tests, real Postgres); 303 unit tests pass.
- Known gaps:
  - Lot problems on a delivery (missing or expired lot) surface asynchronously as a failed outbox row, the same as insufficient stock. A synchronous availability check at confirm time is still a follow-up.
  - POS and sales-invoice auto-deliveries always use FEFO; there is no lot picking there yet.
  - A second partial sales return against the same delivery does not subtract lots already returned.
  - Returns are valued at the current average cost, not the lot cost.

## Opening balances, stocktakes & inventory reports — DONE (2026-10-07, cloud commit 2f47c06 on base 7aa0088; delivered, 33 files, checksums verified; needs `db:migrate` for 0078)
The user chose "رصيد أول المدة والجرد" next. Competitor reference: Daftra stocktaking (daftra.com/en/stocktaking) and Odoo inventory adjustments, where the counted quantity becomes on-hand when applied.

**Migration 0078.** Adds `stock_counts` and `stock_count_lines`:
- `stock_counts`: kind `opening` | `stocktake`, status draft → posted | cancelled.
- `stock_count_lines`: one line per variant + location + lot, with system qty snapshot, counted qty (NULL = not counted) and optional unit cost.
- Numbering sequences `stock_opening` (OPN-) and `stock_count` (CNT-) are created on demand with `ensureTenantWide`.

**Posting** runs in one transaction, with a row lock (no double post) and variant locks.
- **Opening:** posts 'in' movements at the line cost, with lots and expiry for tracked items. Reference is `opening_balance`; a missing cost gives `OPENING_COST_REQUIRED`.
- **Stocktake:** posts an adjustment_increase or adjustment_decrease for counted minus the live quantity at posting time, so sales made while counting are handled. Uncounted lines are skipped. Tracked items are counted per lot. Reference is `stock_count`.
- **Accounting event:** writes `inventory.stock_count.posted` to the outbox with total increase/decrease value and per-line deltas. There is no Accounting listener yet.

**Endpoints**
- `/stock-counts`: list, get, create, patch, lines upsert, delete line, load-stock, refresh, post, cancel, delete.
- `/inventory-reports/item-card`: opening qty at `from`, movements with running balance and source document numbers (receipt, delivery, returns, counts).
- `/inventory-reports/valuation`: Σ qty × average cost per item and warehouse.
- `/inventory-reports/low-stock`: levels at or below the reorder point.

**UI**
- **المخزون › الجرد ورصيد أول المدة:** tabs plus an editor.
  - Scanner entry: each scan adds quantity; a carton barcode adds its pack quantity.
  - Add form with lot and expiry for tracked items.
  - Paste from Excel: code/barcode | qty | cost | lot | expiry, with a preview showing per-row errors, Arabic digits and dd/mm/yyyy dates. In an opening balance, a missing cost falls back to the item's purchase price.
  - Load warehouse stock, refresh book quantities, filters (uncounted, differences), CSV export, post.
- **Report pages:** كارت الصنف (print and CSV), تقييم المخزون (total and CSV), تحت حد الطلب (CSV).
- CSV export uses a UTF-8 BOM so Arabic opens correctly in Excel. No new dependency.
- Verified in a browser against a mocked API: scans, carton ×12, paste with errors, post, and all report pages.

**Tests.** `stock-counts.int-spec.ts` has 5 tests. All 111 integration tests pass on a fresh schema; `roles.repository` fails only when a schema is reused, which is pre-existing. 303 unit tests pass.

**Open**
- Stock-count postings in the GL need an Accounting listener for `inventory.stock_count.posted`.
- A stocktake line for an item with no stock and no cost fails with `UNIT_COST_REQUIRED_NO_EXISTING_STOCK`; the fix is to type a cost on the line.
- Counting by location inside a warehouse works through `locationId`, but the UI always uses the default location.
- Still to do: units on document lines (carton), go-live gaps (numbering seeding for sales/purchase documents, VAT, PDF, supplier payments).

## Product units: buy and sell by carton or sack (step 3b part 2) — DONE
- **Date:** 2026-10-07.
- **Commits:** cloud commit 6fc247f, on base a55948f.
- **Delivery:** 111 files sent; checksums verified.
- **Needs:** `db:migrate` for migration 0079.
- **Why:** the user wants the Inventory module 100% complete before moving to another module. This is item 1 of the remaining-inventory list:
  1. units
  2. synchronous stock check + failed-outbox screen
  3. cost accuracy (FX on receipts, cost precision, returns at original cost, landed-cost fix)
  4. transfer document, granular permissions, item images, Excel product import, GL postings

### Data model (migration 0079)
- New table `product_units`, one row per extra unit of a product (carton, sack…):
  - `factor` = how many base units it holds;
  - optional own sale and purchase price;
  - one default unit for sales and one for purchases;
  - not allowed on serial-tracked products.
- The 11 document line tables now have `unit_of_measure_id` (NULL = base unit) and `unit_factor` (frozen at creation): quotation, sales order, delivery, sales invoice, sales return, credit note, supplier quotation, purchase order, goods receipt, purchase invoice, purchase return.

### Server behaviour
- `ProductUnitResolver` (in `shared/catalog`, read-only) validates units on quotation, sales order, supplier quotation and purchase order lines, and on direct-invoice and POS lines.
- Downstream documents copy the unit of the order line they come from, so "remaining quantity" checks still compare like with like.
- Stock events convert to base units:
  - goods receipt: quantity × factor, unit cost ÷ factor, lot quantities × factor;
  - delivery: quantity × factor, lot quantities × factor;
  - returns: quantity × factor.
- Manual stock movements recognise product units.
- The product lookup returns `units`.

### Endpoints
- `GET /products/:id/units`
- `PUT /products/:id/units`

### UI
- New "الوحدات والأسعار" dialog in the product menu.
- Unit picker on quotation, sales order, purchase order, supplier quotation, direct-invoice and POS lines. The price fills from the unit's own price, or base price × factor.
- In POS, scanning a carton barcode adds 1 carton when a matching unit exists.
- Documents and worksheets show the unit next to each quantity.
- The delivery lot picker shows availability in the line's unit.

### Verification
- Tests:
  - product-units.int-spec: 4 tests.
  - Full suite on a fresh schema: 418 passed.
  - Nest dependency injection compiled for the whole AppModule.
- Browser check on a mocked API: saving units; on a direct invoice, picking feed defaults to the sack at 700 and switching to kg gives 15.

### Notes
- Lot quantities on a line are in the line's unit.
- The sales-invoice posted event still carries quantity and price in the line unit. Accounting totals are unaffected.
- RFQ and requisition lines stay in the base unit.

## Stock check at confirm + background operations screen — DONE (2026-10-07, cloud commit ba26b73 on a1df0ca; 19 files delivered, checksums verified; needs `db:migrate` for 0080)
Item 2 of the inventory-completion list.

**Stock check when confirming.** A new `StockAvailabilityChecker` (`shared/catalog`, read-only) runs inside the confirm transaction of:
- Deliveries — this also covers POS checkout and invoices that deliver.
- Purchase returns.

It checks base-unit quantities at the warehouse's DEFAULT location, including picked lots, and refuses expired lots for sales. A shortage gives a clear Arabic error that lists each item with requested and available quantities (`DELIVERY.INSUFFICIENT_STOCK` / `PURCHASE_RETURN.INSUFFICIENT_STOCK`). The Inventory listener remains the final authority.

**Outbox bug fixed.** A row left in 'processing' by a crash or restart mid-dispatch used to stay stuck forever: its stock movement or journal entry never happened, silently. Migration 0080 adds `claimed_at`, and the dispatcher now re-claims claims older than 5 minutes. This is safe because listeners are idempotent.

**Failure messages.** The outbox now records failures as the Arabic message plus the error code.

**New endpoints.**
- `GET /outbox-events` and `GET /outbox-events/summary`
- `POST /outbox-events/:id/retry`
- All need `settings.manage`.

**New tab: الإعدادات › العمليات في الخلفية.**
- Shows pending, processing and failed counts.
- Lists each operation with an Arabic name, the reason it failed, and how many attempts were made.
- A retry button re-queues a failed operation.

**Tests.** `stock-availability.int-spec.ts` (3 tests); 421 tests pass on a fresh schema. Nest dependency injection compiles for the whole AppModule.

**Known limit.** The check does not subtract deliveries whose stock event is still pending (a few seconds' window); the listener catches any oversell.

## Cost accuracy — DONE (2026-10-08, cloud commit 61a6600 on a4d3ae9; 32 files delivered, checksums verified; needs `db:migrate` for 0081)
Item 3 of the inventory-completion list. Closes audit H2 and H5, plus the "cost precision" and "returns at current average" items.

**Migration 0081.**
- `stock_levels.inventory_value_amount`: the location's total stock value, now the source of truth. Backfilled from qty × average.
- `stock_movements.total_cost_amount`: the exact value each movement added or removed.
- `goods_receipts.exchange_rate`.
- `landed_cost_allocations.expensed_amount`.

**Value-based average cost.**
- An outgoing movement takes value × qty ÷ on-hand, rounded once. Emptying a location takes exactly what is left.
- The per-unit average is now only a display figure.
- COGS (delivery and sales-return events) uses each movement's exact value.
- Example: 3,000 g received for 10.00 sells as 3.33 then 6.67. It used to lose value to piastre rounding.

**Foreign-currency goods receipts.**
- The rate is either typed on the receipt (shown only when the PO currency differs from the tenant currency) or taken from `exchange_rates` for the receipt date: the latest quote on or before it, manual beating api. It is frozen on the receipt at confirm.
- The event carries a per-base unit cost and an exact line total in the tenant currency.
- With no rate available, confirm is refused (`GOODS_RECEIPT.EXCHANGE_RATE_REQUIRED`) and the receipt stays a draft.
- The read helper is `shared/catalog/currency-rate-reader.ts`: a read-only lookup with BigInt rate math.
- pg returns DATE columns as a Date at local midnight, so the service normalises them with `calendarDate()`.

**Sales returns** re-enter stock at the cost the original delivery took (`unitCostOfReference`), falling back to the current average for older deliveries.

**Landed cost.**
- Each movement's share is split by how much of the selected receipts is still on hand at that location.
- The on-hand part raises the stock value; the sold part is expensed. It used to be refused, or loaded entirely onto the few units left.
- Writes `inventory.landed_cost.posted` to the outbox with `toInventory` / `toCogs`. There is no Accounting listener yet; that comes in step 4.
- The allocations view shows a "على تكلفة المبيعات" column.

**Tests.**
- `cost-accuracy.int-spec.ts`: 5 tests covering precision, return cost, USD rate on file vs typed, missing rate, and landed-cost split.
- 426 tests pass. Only the known `roles` failure on a reused schema remains.
- Nest dependency injection compiles for the whole AppModule.

**Next (step 4):**
- Transfer document between warehouses.
- Granular inventory permissions.
- Item images.
- Excel product import.
- GL postings: Accounting listeners for `inventory.stock_count.posted`, `inventory.landed_cost.posted` and manual adjustments.
