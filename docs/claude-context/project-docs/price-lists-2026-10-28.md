# Price lists (قوائم الأسعار) — 2026-10-28

Built and delivered to the device repo. **Not committed.** Generic feature for any activity (wholesale, retail, distributors…).

## Decisions (user-approved 2026-10-28)

- A list has a **general discount %** off the normal price, plus **fixed prices** per product (all variants) or per variant. Fixed prices beat the %.
- **Quantity breaks** are supported: the same item can appear with a different `min_quantity`. The highest break the line reaches wins. Breaks are in base units.
- **POS:** the list comes from the customer (the walk-in customer's list for walk-in sales). The cashier can switch it; everyone with `sales.manage` can.

## Data

Migration `0102_price_lists`:

- **`price_lists`**
  - `name`, with a unique index on `lower(name)`.
  - `currency`.
  - `discount_percent NUMERIC(5,2)`.
  - `is_active`, `notes`.
- **`price_list_items`**
  - `product_id`, and `product_variant_id` (NULL = the whole product).
  - `min_quantity`, `price_amount`.
  - A unique index over `(list, product, COALESCE(variant), min_qty)`.
  - Cascades on delete of the list, product or variant.
- **`customers.price_list_id`**
  - FK with `ON DELETE RESTRICT`.
  - Deleting a list that is in use gives `PRICE_LIST.IN_USE`; the user should deactivate it instead.

Pricing only: no ledger effect, no outbox.

## API

`PriceListsService` and `PriceListsController` live in Sales and are plain CRUD.

- **Endpoints:** `GET/POST /price-lists`, `GET/PUT/DELETE /price-lists/:id`.
- **Access:** `sales.manage`, with no PlanFeatureGuard (master data, like customers).
- **Saving:** a PUT sends the header plus the full item set, which replaces the old items in one transaction.
- **Validation:** duplicate items and a variant from another product are rejected.

## Price resolution — one place

`apps/web/src/components/product/sale-pricing.ts`:

- `buildSalePricer(list, currency)` resolves in this order:
  1. Variant item.
  2. Product item.
  3. List discount %.
  4. Normal price (`unitPriceText`).
- A line in another unit converts through the unit's factor. A list in another currency is ignored.
- `repricedValue` and `repriceLines` re-price a line only while it still holds the automatic price. A price the user typed is never overwritten.
- The hook `features/sales/api/price-lists/use-document-price-list.ts`:
  - follows the customer;
  - lets the user switch the list by hand;
  - re-prices auto-priced lines once the new list has loaded;
  - never re-prices a document that is only being opened.
- It is used by:
  - quotations (create and edit);
  - sales orders (manual create and edit);
  - direct sales invoices (`DirectLinesEditor` takes an optional `pricer`);
  - POS (adding an existing item again re-prices it for quantity breaks).

## UI

- **Sales › قوائم الأسعار:** a list page, plus an editor page at `/sales/price-lists/:id`. The editor has:
  - the header fields;
  - an items table with the product picker, an "all sizes/colours" checkbox, "من كمية", the list price and the normal price for reference;
  - a search box.
- **Customer form:** a default price list field.
- **Document headers and POS:** a `PriceListSelect`.

## Verification

- API and web typecheck clean; eslint is clean on the touched code.
- Migrations 0001→0102 ran on a fresh Postgres 16.
- The service was exercised against Postgres:
  - save and update;
  - duplicate name, duplicate item and variant mismatch;
  - in use, then delete.
- The pricer was unit-checked: breaks, variant over product, box unit, discount %, currency mismatch, and typed prices being kept.

## Not done / next

- Excel import of list prices.
- "Add all products of a category" bulk fill.
- Showing which list was used on the printed document (lines already store the price, so this is not stored).
- A price list per sales channel.
- Purchase price lists.
