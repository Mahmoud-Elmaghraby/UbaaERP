# Settings hub — phase 3: purchases (2026-11-10)

The earlier phases are written up in `claude/settings-hub-2026-11-09.md` and `claude/settings-hub-phase2-2026-11-09.md`. Phase 2 was committed as `f12c145`.

**User instruction:** build what a big software company would ship (best practice) — Odoo, Qoyod and Daftra are the reference.

## Settings (`APP_SETTINGS`, section `purchases`)
- **`purchases.orderApprovalAmount`** (nullable, company currency): a PO at or above it is confirmed only by holders of `purchases.approve`.
  - Foreign-currency POs use the latest exchange rate.
  - With no rate on file, the PO counts as reaching the amount.
  - A direct purchase invoice is its own order, so the amount is checked when it is posted.
- **`purchases.priceIncreaseMode`** (allow / warn / block) plus **`purchases.priceIncreaseTolerancePercent`**:
  - The price is compared per base unit, net of taxes.
  - "Last price" is the last posted purchase invoice line for that variant and currency; if there is none, the last confirmed PO line. The order being checked is excluded.
  - Checked on PO confirm and on invoice post, because a supplier can bill above the order.
  - `purchases.approve` passes a block.
- **`purchases.overReceiptTolerancePercent`**: lets goods receipts and invoices go past the ordered quantity by this percentage. Applied in both `assertWithinOrdered` checks through `PurchaseLimitsService.orderedLimit()`.
- **`purchases.supplierInvoiceNumberRequired`**: checked on post, and nobody can override it. A duplicate number for the same supplier was already blocked before this phase.
- **`purchases.defaultOrderNotes`**: prefills a new PO.

## Code
- **Migration `0121_purchases_settings`:** adds `purchases.approve` and gives it to the roles holding `purchases.settings.manage`, and to Owner.
- **Domain:** `domain/purchase-limits.ts` holds the pure functions (`findPriceIncreases`, `withTolerance`), tested in its spec.
- **Reader:** `application/services/last-purchase-prices.ts` is a batch reader.
- **Service:** `PurchaseLimitsService` provides `check`, `assert` and `orderedLimit`.
- **Endpoints:** `GET /purchase-orders/:id/limits-check` and `GET /purchase-invoices/:id/limits-check`. The controllers pass the user's permissions to `confirm` and `post`.
- **Web:**
  - `features/purchases/lib/purchase-limits.tsx` holds the callout and the confirm prompt, used on the PO page and the purchase invoice page.
  - The hub has a Purchases section, and the purchases menu has a gear that opens it.
  - `use-new-document-defaults.ts` moved to `components/document/` and is shared with sales.

## Verification
- **Static checks:** api and web tsc and eslint are clean.
- **Unit tests:** 467.
- **Integration tests:** 32 suites / 176 tests. `purchases-integrity` adds two tests: one for the tolerance, one for the limits.
- **UI:** checked with a screenshot of the Purchases settings section.

## Device note
About 325 files in the device working tree show as changed only because their line endings are CRLF instead of LF; their content is the same. I didn't cause this.
- The commit uses `.git/commit-files.txt` so that only the real changes go in.
- Suggestion: `git config core.autocrlf true`, or a `.gitattributes` file.

## Next (remaining in the plan)
- Fixed or editable document numbers.
- Moving Inventory settings into the hub, plus the negative-stock policy.
- Dropping the old `tenant_settings` columns (needs approval).
