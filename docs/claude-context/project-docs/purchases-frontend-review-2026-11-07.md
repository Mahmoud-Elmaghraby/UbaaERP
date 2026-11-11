# Purchases module — frontend review, phases 1–3 delivered (2026-11-07)

## Working method (user, standing)
Go module by module: find problems, add missing features, and fix UI/UX on the way.

- **Done:**
  - Accounting (e5e0cc7)
  - Sales (033b104)
  - POS (0dafa85)
  - Purchases backend (a024675)
  - **Purchases frontend phases 1–3 (this doc, not committed yet)**
- **Next:** Inventory module review, then treasury, sales channels, settings…

## Verification
- web `tsc`: clean. api `tsc`: clean, except the existing Prisma-client errors (the sandbox can't generate the Prisma client).
- eslint on touched code: clean.
- api unit tests: 446 pass. The only 2 failing suites need the generated Prisma client.
- Integration tests: 29 suites / 164 tests pass against a local Postgres 16, with all tenant migrations (0001→0115) applied. See the tooling note.

## Phase 1 — every purchases document is a full page (same shape as Sales)
- Routes per document: list, `/new`, `/:id`, and `/:id/edit` for editable drafts. Covers suppliers, requisitions, RFQs, purchase orders, goods receipts, purchase returns, supplier payments and debit notes. Routes are in `features/purchases/routes.tsx`.
- **Lists:** status tabs with counts, search, and a row opens the page.
- **Pages:** built from `DocumentHeaderBar`, `DocumentChain`, `InfoGrid`, `TotalsPanel` and `DocumentHistory`. Ctrl+S saves.

**Purchase orders**
- The editor creates an order manually, or from a quotation (`?quotationId=`).
- The order page has "receive goods" and "purchase invoice" buttons.
- Its chain shows quotation → order → receipts → invoices.

**Goods receipts**
- `?purchaseOrderId=` preselects the order.
- A "receive all remaining" button.
- A "return" button on a confirmed receipt.

**Returns**
- `?goodsReceiptId=` preselects the receipt.
- The return page shows its debit note.

**RFQs**
- Picking an approved requisition copies its lines.
- The RFQ page has a quotation comparison table: each supplier's unit price, the cheapest one per item highlighted, and totals.
- "Create PO" from the selected quotation.

**Requisitions**
- The page shows the approval chain, with submit / approve / reject.
- "Create RFQ" on an approved requisition.

**Supplier payments**
- Save as draft, or save & post.
- Pay by our own cheque, or endorse a customer cheque.
- Allocate with the shared allocation table, which can auto-distribute.
- The page has "allocate the rest" and clear cheque.

**Suppliers**
- Editor page.
- Profile page: balance and aging, open invoices, recent POs and attachments.

**Purchase invoice page**
- A "pay this invoice" button.
- `?purchaseOrderId=` preselects the order.

**Links**
- Old `?view=` links now go to `/supplier-payments/:id`.
- Journal entries link to debit notes, supplier payments and goods receipts.

## Phase 2 — debit notes (read-only)
- **Contract:** `purchase-debit-note.contract.ts`.
- **API:** `GET /purchase-debit-notes[?supplierId|purchaseReturnId]` and `GET /:id`, through `PurchaseDebitNotesService.list` and `getById`.
- **Error:** `PURCHASE_DEBIT_NOTE.NOT_FOUND`.
- **Pages:** `/purchases/debit-notes` and a details page. The note prints with its purchase return.

## Phase 3 — delivered (user approved all of it)

### Purchase analysis
- **Endpoint:** `GET /purchase-reports/analysis?groupBy=supplier|item|category|month&fromDate&toDate&supplierId`.
- **What it counts:** posted invoice lines before tax, minus debit-note lines.
- **Currency:** company currency only. Foreign-currency documents are counted as excluded.
- **Columns:** gross, returns, net, share %, invoice count. Quantity for item and category; average unit cost for item.
- **Code:**
  - aggregator: `purchases/domain/purchase-analysis.ts` (with a spec);
  - service: `PurchaseAnalysisService`;
  - controller: `PurchaseReportsController`.
- **Page:** `/purchases/reports/analysis`, with Excel export and a sidebar item.

### Last purchase price and price history
- **Endpoint:** `GET /purchase-reports/price-history?productVariantId&supplierId&limit`.
  - Returns posted invoice lines, newest first.
  - Each price is the net price per base unit.
  - Also returns `lastFromSupplier`.
- **UI:** `purchases/lib/last-purchase-price.tsx`, shown under each line's price in the PO editor and in direct purchase invoices.
  - Click the last price to use it.
  - A popover lists the history.
  - Prices are converted to the line's unit.
- `DirectLinesEditor` gained an optional `priceHint` slot for this.

### Low stock → draft PO
- The low-stock page has row checkboxes and a "create purchase order" button.
- The button opens a new PO, or a direct purchase invoice when POs are off.
- Lines are passed as router state (`purchases/lib/prefill-lines.ts`).
- Quantity = the shortage below the reorder point, summed over the selected rows.
- Prices are filled from the supplier list or the purchase price.

### WhatsApp share for a purchase order
- **Endpoint:** `POST /purchase-orders/:id/share-link`. Cancelled orders are refused.
- `purchase_order` was added to `SHAREABLE_DOCUMENT_TYPES`.
- `WhatsAppShareButton` and `createShareLink` moved to `components/document/whatsapp-share.tsx`, shared by sales and purchases. `sales/lib/whatsapp-share.tsx` was deleted.
- **i18n:** `documents.whatsapp.*`, and `purchases.whatsapp.orderMessage` for the message.

### Supplier price lists
- **Migration `0115_purchase_price_lists`:**
  - `price_lists.kind` ('sale' | 'purchase', default 'sale');
  - the name index is now unique per kind;
  - `suppliers.price_list_id`, a foreign key with RESTRICT.
- **API:**
  - `PriceListsService` is scoped by kind: a list of the other kind counts as "not found".
  - One controller factory serves `/price-lists` (sales.manage) and `/purchase-price-lists` (purchases.manage).
  - The summary includes `kind` and `supplierCount`.
  - `SuppliersService` checks the supplier's default list is a purchase list (error `SUPPLIER.PRICE_LIST_KIND`).
  - Integration test: `test/integration/price-lists.int-spec.ts`.
- **Web:**
  - The sales price-list screens, select and queries take `kind`; the config is in `sales/api/price-lists/price-list-kind.ts`.
  - `buildSalePricer(list, currency, priceKind)` falls back to the purchase price for purchase lists.
  - `useDocumentPriceList` options were renamed to `partyPriceListId` and `partyId`, plus a new `kind`.
  - New page `/purchases/price-lists`.
  - The supplier editor has a default list field.
  - The PO editor and direct invoices auto-price from the supplier's list, which the user can switch. The direct invoice now uses `SupplierPicker`.

### Deferred
- Excel import of list prices.
- Grouping a low-stock order by each item's last supplier.
- Price lists on supplier quotations.

## Shared or unified code (no duplication)
- `components/product/use-variant-index.ts` replaces 14 per-entity copies.
- `components/party/party-picker.tsx` is the generic picker behind `CustomerPicker` and `SupplierPicker`.
- `components/document/open-invoices-allocation.tsx` is the allocation table, shared by sales and purchases.
- `components/document/whatsapp-share.tsx`.
- `components/report/report-format.ts`.
- `apps/api/src/shared/reporting/fixed-point.ts` (moved out of the sales analysis domain, which re-exports it).
- `lib/use-save-shortcut.ts`: 11 older editors still have their own Ctrl+S code; migrate them when touched.
- 38 obsolete files were deleted, with the user's approval.

## Tooling note for future sessions
The device VM can't run `tsc`: pnpm's Windows junctions can't be read there, and the VM has no network.

**Workflow that worked:**
1. Tar the repo, excluding node_modules, `.git`, `apps/desktop/{.cache,staging,release}` and `Claude outputs`.
2. Stage the tar, extract it in the cloud, run `pnpm install --ignore-scripts`, then build the libs with `tsc -p`.
3. Typecheck, lint and test there.
4. Tar the changed files, commit the tar to the device, and run `tar --overwrite -xzf`. Plain extraction fails because deletes are blocked.
5. Check every file's md5 on the device against the cloud copy, ignoring CR characters.

**Integration tests in the cloud:**
- Postgres 16 is installed. Run `initdb` and `pg_ctl` as the postgres user under `/var/tmp/pg`, on port 5433.
- `apps/api/.devcheck/` (git-ignored, sandbox only) has a jest config that provisions the schema straight from the tenant migrations and stubs `@prisma/client`.
- Run: `DATABASE_URL=postgres://postgres@localhost:5433/postgres npx jest -c .devcheck/jest.int.config.js`.
