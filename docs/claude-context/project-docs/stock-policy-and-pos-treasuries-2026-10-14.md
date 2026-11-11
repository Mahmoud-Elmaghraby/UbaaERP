# Selling without stock and POS treasuries (decisions 2026-10-14)

## Selling when stock runs out — decided: never negative, quick add instead
- Stock stays non-negative. The DB CHECKs on stock_levels and lot levels, FIFO lots and costing all rely on it.
- Allowing negative stock was discussed and rejected for now:
  - Sold items have no cost until goods arrive.
  - Lots and expiry can't be consumed if they don't exist.
  - A shortage usually means a data error (purchase not entered, transfer missing).
- What exists instead:
  - `StockAvailabilityChecker` puts structured shortages into `DomainError.data` (`{ warehouseId, shortages: [{ productVariantId, name, requested, available }] }`). The exception filter returns them as `data`. Lot/serial items are excluded.
  - Web: `onApiError` hook in api-client feeds `QuickStockDialogHost` (mounted in AppProviders). It reacts only to `DELIVERY.INSUFFICIENT_STOCK` (sales, POS, invoices that deliver).
  - Dialog contents:
    - each item with requested / available;
    - quantity to add (prefilled with the shortage);
    - unit cost (prefilled with the purchase price);
    - a reason.
  - "إضافة الرصيد" posts one stock adjustment (`POST /stock-adjustments` with `post: true`), then the user repeats the sale.
  - It needs `inventory.movements.manage`. Users without it see what is missing and are told to ask the stock manager.
- If a future client really needs negative stock (restaurants, workshops), make it a Sales/Inventory setting then.

## Payment methods = the tenant's treasuries (no separate setup)
- The owner's model: each method (cash drawer, bank for card/InstaPay, Vodafone Cash wallet…) is a treasury the client creates. The user picks the treasury when collecting money. With Accounting on, each treasury is linked to its account.
- Receipts and supplier payments already picked their treasury.
- POS now also does (commit after d1ad906):
  - Each tender picks its treasury; the default is the session's cash box.
  - Cash stays in the session box (counted at closing).
  - Any other tender goes to the chosen treasury.
  - `posCheckoutTenderSchema.treasuryId`.
- Before this, non-cash POS tenders went to no treasury.
