# Clothing release 0.2.0 — additions before shipping (2026-11-11)

Follows claude/clothing-release-0.2.0-2026-11-10.md.
- **Variant codes (factory codes).**
  - **Create form:** the product form's size/colour rows have a code box (empty = auto). `variantPrices[]` also carries `sku`/`barcode`. Duplicates are checked within the form and against existing codes.
  - **Excel import:** the file can have one row per variant.
    - Columns: `option1..3` plus `variantCode`. The option names come from the column headers (`optionNames`).
    - Rows that share a code (or a name) become one product. The first row creates the product; each later row adds its own variant, with its own price and opening quantity.
    - Upsert can update an existing variant's code or add a new colour.
- **Labels:**
  - The name wraps to 2 lines.
  - "اطبع كود الصنف كباركود" prints the SKU (factory code) as the barcode even when the item has a barcode.
  - The page warns when a code is too long for the label's width (bars under 0.19 mm).
  - Numeric code runs use Code 128 set C, which gives narrower bars.
- **Scanner on the Arabic keyboard layout:** `lib/keyboard-layout.ts`. `resolveScan` retries the code with the Arabic letters mapped back to the Latin keys, in the POS, stock lines and counts.
- **Crash ("the program closes by itself"):**
  - **Cause, reproduced:** the tenant pg `Pool` had no `'error'` listener. An idle connection dropping (sleep/wake, DB restart) crashed the API. The window then reloaded, and after 5 crashes in 5 minutes the app quit.
  - **Fixes:**
    - A pool error listener.
    - `unhandledRejection` is logged instead of exiting.
    - The desktop reloads the window on `render-process-gone`.
    - Events are written to `logs/desktop.log`.
- **Verification:** api and web tsc and eslint, 471 unit tests, 33 integration suites / 179 tests (new variant-rows import test).
