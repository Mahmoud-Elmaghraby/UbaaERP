# Inventory step 4 — 2026-10-08
## Step 4 — transfers, permissions, images, Excel import, GL postings — DONE (2026-10-08, cloud commits 8d45691…dee615a on base 4eafc16; NOT yet delivered: the device was offline — needs `pnpm install` + `db:migrate` for 0082–0088)
User was away and asked to continue autonomously, make cross-module needs central services, and pick the best option on decisions.

**Migrations.** 0082 granular permissions · 0083 stock_transfers · 0084 stock adjustments + reasons + GL accounts/settings · 0085 product_images · 0086 default units (empty table only) · 0087 outbox back-off · 0088 default accounts 55/56/57 for purchase expense, cash over/short, FX differences (only when the code is free and the mapping empty).

**Permissions (0082).** `inventory.manage` replaced by 12 keys (products.view/manage, costs.view, stock.view, movements.manage, transfers.manage/approve, counts.manage/post, landed_costs.manage, reports.view, settings.manage). Every role that had inventory.manage gets all of them; Owner always. Costs are masked server-side without `costs.view` (levels, movements, lots, item card, expiring lots, transfer/adjustment values; purchase prices hidden unless costs.view or purchases.manage, and never wiped on save). Catalogue/warehouses/units readable by any inventory role + sales + purchases (sales-only users used to get 403 on /warehouses). Roles screen: grouped by module with Arabic labels and group select-all. Sidebar children have their own permissions; /inventory lands on the first allowed page. `GET /settings` (company profile/currency) open to every signed-in user.

**Transfers (0083, TRF-).** draft → dispatch (in transit) → receive (shortage allowed, written off) or one-step post; cancel in transit returns goods to the source at the same value. Units (carton) and lots (picked or FEFO) supported; one Arabic error lists every short item. "Goods in transit" value shown on the valuation page.

**Adjustments (0084, ADJ-).** Multi-line increase/decrease document with reasons (seeded: فروق جرد، تالف، منتهي الصلاحية، استهلاك داخلي، عينات، فقد، إضافة بدون فاتورة، تسوية). A reason may carry its own GL account. The old quick "record movement" dialog now creates a posted adjustment (number + journal entry).

**GL postings.** One central event `inventory.valuation.posted` (shared/events/inventory-valuation-event.ts) written by `InventoryValuationEventsService`; Accounting's `AccountingInventoryPostingListener` maps kinds to accounts: receipt Dr Inventory/Cr GRNI (217), purchase return reverse, adjustments/count differences/transfer shortages vs reason account or 54 تسويات وفروق المخزون, opening vs 35 أرصدة افتتاحية, landed cost Dr Inventory+COGS / Cr landed-cost clearing (default purchase expense). **Purchase invoice now clears GRNI for stock lines; only service lines hit purchase expense** (perpetual inventory, Odoo-style). Verified on a live API: opening → transfer shortage → adjustment → PO/GRN/invoice all produced balanced entries; GRNI nets to zero.

**Valuation & reconciliation.** Valuation report "as of" any date (rebuilt from movements + landed-cost allocations), goods in transit, and a summary card comparing stock value with the GL inventory account balance (difference highlighted).

**Movements & traceability.** Movements screen: date range / type filters, load-more, document column with number + customer/supplier, links to inventory documents. New central read-only `shared/documents/document-reference-reader.ts` (reference type+id → number + party) used by movements, item card (new party column, also in Excel export) and the new **lot / serial trace report** (`/inventory/lot-trace`, `GET /inventory-reports/lot-trace?lotNumber=`): supplier receipt → warehouses → customers, with in/out/on-hand totals (recall).

**Stocktake by location.** "Load stock" opens a dialog: whole warehouse, one location (shelf-by-shelf cycle count) and/or one category with its sub-categories.

**Fix.** A second partial sales return of the same delivery no longer refills lots an earlier return already refilled (Sales sends `earlierReturnIds` on `sales.sales_return.confirmed`).

**Item images (0085).** New central `shared/storage` (one MinIO client/bucket; attachments now use it too). Up to 12 images per item, primary one shown in products list and the product picker; browser resizes (≤1600 px + 320 px thumb, WebP) so no server image library; presigned URLs stable for an hour (cacheable).

**Excel import.** `/products/import` dry-run ("test import") runs the real code in a transaction with a savepoint per row and rolls back; real import all-or-nothing unless "skip invalid rows". Arabic headers auto-mapped, Arabic digits, category paths "أغذية > ألبان" created on demand, brands/units optionally created, upsert by code, opening quantities → draft OPN. New dependency-free `apps/web/src/lib/xlsx.ts` (read .xlsx/.csv, write real .xlsx RTL) — inventory reports now export real Excel.

**Platform bugs found while verifying end to end (all fixed):**
1. **@OnEvent swallowed every listener error** (`suppressErrors` defaults to true) → outbox rows marked processed even when stock or journal entries failed; nothing was ever retried. New `OnOutboxEvent` decorator (suppressErrors:false) used by all 11 outbox listeners, with a test proving it.
2. **pg returned DATE as JS Date** while types/contracts say string → e.g. `GET /journal-entries` 500, purchase invoice with a date 500. Tenant pools now parse DATE as 'YYYY-MM-DD' text (stock_lots.expiry_date converted in its repository).
3. New tenants had **no numbering sequences** → first invoice/JE failed. `NumberingSequencesService.allocateNext` creates defaults on first use (central DEFAULT_DOCUMENT_NUMBERING table).
4. **No fiscal year** → every automatic journal entry failed. The first posting creates the calendar fiscal year (12 periods) when the tenant has none.
5. Outbox retried every 5 s and gave up after 10 tries (<1 min). Now exponential back-off 10 s→1 h, 12 attempts (~4.5 h).
6. New tenant had no units of measure → could not create an item (0086 seeds 8 units).
7. New tenant had no purchase-expense / cash over-short / FX accounts mapped → those postings failed in the background (0088).

**Tests.** Unit 312, integration 137, e2e 24 — all pass on a fresh schema. Browser-verified against the real API (owner + a store-keeper role without costs).

**Open / next.** VAT on sales & purchase invoices (go-live blocker #1) — next. POS product grid with images, FIFO valuation, kits/bundles, blind counts, reorder → draft PO are proposals, not started. `transfer-stock-form.tsx` in web is now unused (kept, not deleted).
