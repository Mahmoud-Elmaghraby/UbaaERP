# Settings module review and fixes (2026-10-09)

## Done
- **Currencies** (migration 0098):
  - New `currencies` table, seeded with EGP/USD/EUR active and SAR/AED/GBP/CNY/TRY inactive, plus any currency the tenant already uses.
  - The company currency must be an active currency (`CURRENCY.NOT_USABLE`).
  - `CurrencySelect` (web `components/document/currency-select.tsx`) replaces every free-text currency field: general settings, customers, suppliers, payments, treasuries, opening balances and bank accounts.
  - Settings › Currencies manages the list, and its exchange-rates card shows when Multi-Currency is on.
  - `/exchange-rates` is now gated by `MULTI_CURRENCY` + `settings.manage` (it was ACCOUNTING + accounting.manage).
- **Numbering:**
  - `GET /numbering-sequences` makes sure every default document type exists first, so the screen lists all of them, grouped by module, with Arabic names and a sample number.
  - Tenant-wide sequences can't be deleted from the UI.
  - Customers and suppliers get automatic codes (CUS-/SUP-) when the code is left empty, via `NumberingSequencesService.allocateCode`.
- **Module settings:**
  - `NavItem.settings` adds a gear next to the module in the sidebar.
  - Inventory settings moved to `/inventory/settings`; Accounting links to `/accounting/settings`.
  - Settings › Modules shows a shortcuts card to every module's settings page.
- **Printing:** new providers for purchase_return (with its debit note amounts), sales_return (with its credit note), stock_transfer and stock_adjustment. Print buttons were added on those pages.

## Still open (proposals, need a decision)
These change how the system behaves, so they need the owner's decision first:
- Sales/POS settings: selling when stock runs out (block / warn / allow), selling below cost, the default walk-in customer, and a default note on invoices.
- A payment-methods list (cash, card, InstaPay, Vodafone Cash), each method linked to a treasury.
- Treasury settings: bank overdraft allowed or not (today banks are exempt from the negative-balance guard).
- More than one print design per document type (competitors offer this).
- Note: the git push from the cloud is blocked (the repo is not in the session's authorized sources). A git bundle `erp-commits.bundle` is delivered to the user's folder so they can push from their own machine.
