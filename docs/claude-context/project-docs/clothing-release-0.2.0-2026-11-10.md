# Clothing client release 0.2.0 (2026-11-10)

The user's urgent client is a clothing seller. They buy from factories and companies, sell online on Amazon and Jumia at one price and to the general customer at another, and also sell wholesale and retail. They already have v0.1.0 installed with their items entered, so the update must apply without breaking anything.

## What was built
- **Price lists, part 2 (migration 0122):**
  - **Signed adjustment.** `price_lists.adjust_percent` runs from −100 to +1000. A negative value is a discount; a positive value is a markup (an online price above the shop price). The old `discount_percent` was converted to `adjust = −discount` and is kept in place, no longer read.
  - **Category rules.** `price_list_category_rules` holds a % per category. A rule also covers the category's sub-categories unless they have their own rule.
  - **API output.** The API also returns `categoryAdjust`, the resolved % for every category, so the web pricer needs no category tree.
  - **Resolution order:**
    1. variant price
    2. product price
    3. category rule
    4. list adjustment
    5. normal price
  - **Pricing logic location.** All of this lives in `sale-pricing.ts`, the one place every document and the POS use.
  - **Channel pricing.** A sales channel's customer (Jumia, Amazon) carries its own price list, so choosing the channel on an invoice prices it.
- **Price list ⇄ Excel** (`price-list-excel.ts`):
  - Export writes one row per active variant plus one row per quantity break, so the file also works as a template.
  - Import matches rows by SKU. Unknown SKUs and bad prices are counted and reported.
- **POS exchange (استبدال):**
  - **Endpoint:** `POST /pos/sessions/:id/exchange` (`PosExchangeService`) does the whole exchange in one transaction:
    1. Return the items as customer credit.
    2. Check out the new sale with the cashier's tenders plus a cash tender worth the credit; cash beyond the total becomes change.
    3. Pay out a cash refund of the credit note.
  - **Why it adds no new money flow:** the drawer nets to exactly sale total − credit, and every document is fully settled.
  - **Web:**
    - The return dialog has a 4th mode, "استبدال", which hands the chosen lines to the cart.
    - The cart shows the credit and "المطلوب / يرجع للعميل", and checks out through the exchange endpoint.
- **Sales analysis, more groupings:**
  - New groupings: product (all its sizes), category, option (size or colour, picked from `optionNames`), cashier, and channel.
  - The channel grouping adds the platform fees from posted settlements in the period, and profit after fees.
  - Groupings follow the activity switches (rep → `sales.reps`, cashier → `pos`, channel → `sales.channels`).
- **Size × colour grid** (`components/document/variant-grid-dialog.tsx`):
  - "إضافة موديل بالمقاسات" sits in the shared lines editor: purchase orders, direct purchase invoices, sales orders, quotations and direct sales invoices.
  - Pick a model, type a quantity per size and colour, and set one price per piece. Each filled cell becomes a line in the base unit.
- **Version:** desktop `apps/desktop/package.json` 0.1.0 → 0.2.0.

## Upgrade safety
- **Rehearsal test.** `test/integration/upgrade-rehearsal.int-spec.ts`:
  1. Builds a tenant at `0101_variant_prices`, the version installed on 2026-10-15.
  2. Fills it like the client's: categories, a model in sizes × colours with its own prices and barcodes, stock in two warehouses, customers, and a Jumia channel.
  3. Runs every later migration.
  4. Checks that every count, stock quantity, stock value, price and barcode survives, and that the new features work on that data.
- **The installer adds two more safeguards:** a pre-update `pg_dump`, and migrations that only add (no drops).
- **Tell the client:** activity switches they never used start OFF after the update (migration 0118). If POS was never used it is hidden; turn it on in الإعدادات › الموديولات. Marketplaces stay on if a channel exists.
- **Taxes off:** the client uses no taxes. Every flow works without tax rules, which is the default path the tests already exercise; the tax UI shows only when tax rules exist.

## Verification
- **Typecheck and lint:** api and web tsc and eslint are clean.
- **Unit:** 471 tests, including the new `pos-exchange.service.spec.ts` and new analysis groupings.
- **Integration:** 33 suites, 178 tests, including price-list rules and the upgrade rehearsal.
- **e2e:** the POS exchange case was added to `pos-operations.e2e-spec.ts`. It needs Prisma, so run it on the user's PC.
- **Screenshot:** the price list editor (markup, category rule, Excel buttons).

## Not in this release (next)
- Promotions with conditions ("buy 2, get 1").
- Importing the daily Jumia orders file (needs the client's file).
- Desktop auto-update and an off-machine backup.
- A real restore rehearsal on the client's own backup (needs the file from them).
