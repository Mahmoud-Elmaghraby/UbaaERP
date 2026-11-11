# Target customers & what they need from Inventory (2026-10-06)

The user's current prospective customers (Egypt):
1. **Clothing brand** — size × color variants, auto SKU per variant, barcode per variant + label printing, categories/collections/seasons, multiple stores/warehouses, POS, exchanges/returns, retail vs wholesale prices, purchase entry as a size×color grid.
2. **Printing on marble & ceramics** — raw materials (tiles/slabs, inks) + finished/printed goods + printing as a service; units by area/dimensions (carton ↔ m², slab sizes); per-job material consumption (BOM-like) and job costing.
3. **Pharmaceutical company** — lot + expiry mandatory on every movement, FEFO that never issues expired stock, near-expiry alerts, recall/trace by lot, units box/strip/unit, distribution to pharmacies.
4. **Medical devices company** — serial number per device on receipt/sale, warranty per serial, installation/maintenance services, lots + expiry for consumables.
5. **Animal feed company** — weight units (ton / kg / 50 kg bag) with conversions, lots with production & expiry dates, raw materials + finished feed (mixing formula = BOM), bulk quantities.

## Cross-cutting conclusions
- **Lot/serial/expiry on documents is a must for 3 of 5 (pharma, devices, feed)** — today it's broken (audit C2: tracked items never reach stock from goods receipts). Highest priority after stock-integrity fixes.
- **Multiple units per item with conversion, price and barcode per unit** — needed by ceramics, pharma, feed.
- **Item types (stock / service / consumable)** — ceramics printing service, device maintenance.
- **Variants matrix + auto SKU + barcode labels** — clothing.
- **Configurable auto codes / SKU / barcode per tenant** (inventory settings inside Settings › Modules) — all.
- **Manufacturing / BOM** (ceramics, feed) — a new module, outside the fixed six-module scope → needs explicit user decision (CLAUDE.md §17.3); not started.

## Agreed direction (pending confirmation of order)
1. Inventory phase 1 — stock integrity (locking, no swallowed errors, idempotency, immutable unit/tracking, serial uniqueness).
2. Lots/serials/expiry on goods receipts, deliveries, returns; FEFO skipping expired; near-expiry report; serial warranty.
3. Product rebuild: item type, category tree, brand, image, default prices & tax, multi-unit with price/barcode, multiple barcodes, variant matrix generation, configurable auto code/SKU/barcode, label printing, per-module settings framework.
4. Reports: item card, valuation, low stock, stocktake, opening stock import.
