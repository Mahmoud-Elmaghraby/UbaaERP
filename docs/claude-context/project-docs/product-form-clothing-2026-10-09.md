# One-step product form: options inline, no SKU, default unit (2026-10-09, commit after 399e301; updated 2026-10-11, commit 39dea2b)

This came from preparing the first client (a clothing shop). The rule was to build it generically, with no "clothing mode", so every other activity keeps working.

## What changed
- **SKU is never typed.**
  - It is generated automatically: the product code for a simple item, and code-2, code-3… for variants.
  - The create form had a bug that made it always require a SKU: an empty string failed `min(1)`. Fixed.
- **Default unit** (migration 0097):
  - `inventory_settings.default_unit_of_measure_id` was added and backfilled to "قطعة".
  - A product created without a unit gets the default unit.
  - Since 2026-10-11, if there is no default, "قطعة" is found or created and becomes the default, so the API never asks for a unit. The `PRODUCT.UNIT_REQUIRED` error is no longer thrown.
  - The form shows the unit as one optional line ("وحدة القياس: قطعة · تغيير"). A grocery can set its default to كجم in Inventory settings.
- **Variants inline:** the "له متغيرات" checkbox is gone.
  - The form has an optional "options" section: size, colour, or any option name.
  - Values are entered as chips, and every combination is listed.
  - `createProductSchema.variantOptions` creates the product and every combination in one transaction (`ProductsService.createCombinations`, shared with `generateVariants`).
- **Templates without a setup screen:**
  - `GET /products/variant-options` returns the option names and values the tenant already used.
  - The form offers them as one-click chips plus "إضافة الكل".
- Tracking type (lot/serial) moved under "خيارات متقدمة".
- **Per-variant prices** (migration 0101, 2026-10-11):
  - `product_variants` has its own sale and purchase prices, nullable; NULL means the product's price.
  - The catalogue lookup that every document and POS uses returns COALESCE(variant price, product price).
  - Create form: each combination has a price box ("سعر واحد للكل" + "تطبيق على الكل"). Rows that differ from the product price are sent as `createProductSchema.variantPrices`.
  - Variants dialog: the price is edited in place (saved on blur). It also has "سعر واحد للكل" and "رجّع الكل لسعر المنتج".
- **Category picker fix (2026-10-11):** the shared `Combobox` (libs/ui) is now a modal popover. Inside a modal dialog the old one opened but its options couldn't be clicked. **libs/ui must be rebuilt.**

## Recommended settings for the clothing client
- Inventory settings: item codes **auto**, barcode **auto** (so every size/colour gets a printable barcode), default unit قطعة.

## Not done (possible next steps)
- Opening quantity per variant from the product form (currently via the opening-stock screen).

The owner considers the product and variants work closed as of 2026-10-11.
