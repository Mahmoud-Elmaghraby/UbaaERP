# Inventory module review — passes 1–2 delivered (2026-11-07, uncommitted)

The backend was already hardened by the October inventory audit (see `inventory-audit-2026-10.md`): integrity, lots, units, cost accuracy and GL postings (Accounting's inventory posting listener now covers valuation events). These passes are about daily use, built straight away at the user's request. Every inventory screen is now a routed page: list → `/new` → `/:id` → `/:id/edit`, with no tab + dialog screens left.

## Pass 1 — delivered to `M:\Projects\erp-platform`

**Verification**
- web and api `tsc`: clean.
- eslint on touched code: clean.
- Unit tests: 446 pass.
- Integration tests: 30 suites / 165 tests pass, including the new `inventory-movement-analysis.int-spec.ts`.

### Products as pages
The old list with five dialogs is gone (`products-tab.tsx` was deleted).

- **`/inventory/products` list**: status tabs with counts, search, a category filter that includes sub-categories, purchase and sale price columns, row → item, Import from Excel and New item buttons.
- **`/inventory/products/new` and `/:id/edit`**: the existing form as a full page. `onDone` receives the product id.
- **`/inventory/products/:id` item page**: info; variants with stock on hand; stock by warehouse with value (value needs `costs.view`); prices; images, attachments, history; item card / print labels / edit / delete. The variants, units and images dialogs open from here.
- **API**: `GET /stock/levels?productId=`.

### Barcode labels
- Label layout: product name, then size/colour bold, then barcode and price.
- The labels page accepts router state `{ labels: [{ variantId, copies }] }` (`LabelsPrefillState`). It is filled from the item page (copies = stock on hand, or 1) and from the goods receipt page (copies = pieces received).

### Movement analysis: best sellers and slow movers
- **Page**: `/inventory/movement-analysis`.
- **Endpoint**: `GET /inventory-reports/movement-analysis?from&to&warehouseId&categoryId`. The default period is 90 days; categories are recursive; costs need `costs.view`.
- **Views**: best sellers, slow movers (with the total slow stock value) and all.
- **Columns**: days of cover; "N days ago" since the last sale. Excel export.

### Cleanup
- One `useLocationLookups`, in `inventory/api/warehouses/queries.ts`.

## Pass 2 — remaining screens as pages (delivered, uncommitted)

Verification: web `tsc` and eslint clean (web has no test suite; nothing on the API changed).

- **Warehouses**
  - `/inventory/warehouses` list: status tabs, search, address column.
  - `/new` and `/:id/edit` editor pages. `Create/EditWarehouseForm.onDone` now receives the id.
  - `/:id` warehouse page with info, an inline **locations section** (quantity on hand per location; add/edit stay small dialogs), the **top 10 items** (by value, or by quantity without `costs.view`, with a "below reorder point" badge; a row opens the item), and a summary panel (item count, total quantity, below-reorder count → low-stock page, stock value).
  - Header links go to the stock page filtered by this warehouse (levels / movements).
- **Units of measure**
  - List page: tabs for all / base / derived / inactive, search, and units grouped by family (the base unit first). The conversion shows as `1 ctn = 12 pcs`.
  - The converter is now a card under the list.
  - `/new` and `/:id/edit` editor pages, with delete and a list of the units derived from this one.
- **Stock page `/inventory/stock`**
  - The view (levels / movements / lots) and every filter (variant, warehouse, location) live in the URL: `?view=movements&warehouse=…`.
  - Header actions: manual movement, adjustment, transfer.
  - Levels: the product links to its item page; quantity is coloured (negative = red, at or below the reorder point = amber); a new stock value column (only with `costs.view`).
  - **Manual movement is a page**: `/inventory/stock/movements/new?warehouse=`. After saving it returns to the movements view.
- **Landed costs**
  - List (search; a row opens the record).
  - `/new` apply page. The movement picker gained select-all and a source-document column.
  - `/:id` page: info, an allocations table (the product links to its item page), and a panel with capitalised vs expensed vs total.
- **Shared change**: `VariantIndexEntry` now carries `productId`, so any variant row can link to its item page.
- **Deleted** (now unused): `warehouses-tab`, `warehouse-locations-dialog` (became `warehouse-locations-section`), `units-of-measure-tab`, `stock-tab`, `transfer-stock-form` (dead code; transfers have their own document pages), `landed-costs-tab`, `landed-cost-allocations-view` (became `landed-cost-allocations-table`).

## Next candidates (not built)
- **Sales analysis by size / colour / category**: options for the existing sales analysis report. This was the clothing customer's top request; the movement analysis already covers it per variant.
- **Reorder suggestions**: reorder point plus the selling pace from the movement analysis → a suggested quantity on the low-stock list.
- **Landed cost from a purchase invoice / goods receipt**: prefill the apply page from a receipt's movements. Today the user picks the movements by hand, and the reference is free text.
