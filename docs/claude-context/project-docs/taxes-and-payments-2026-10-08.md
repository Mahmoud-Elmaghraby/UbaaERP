# Taxes, receipts and supplier payments — 2026-10-08

Cloud commits 8493112…90c8425 (on top of the inventory step-4 work), delivered to M:\Projects\erp-platform as two tarballs (checksums verified). Needs `pnpm install`, `pnpm build` in libs/shared-kernel and libs/contracts, and `db:migrate` (0082–0092). Nothing committed/pushed on the user's side.

## Payments
- **Customer receipts now reach the ledger** (before: `sales.payment_received.posted` had no listener — cash never increased, receivables never cleared). `AccountingPaymentPostingListener`: Dr chosen bank account's GL / cash (cash method) / default bank (112) — Cr AR. Receipts can name a bank account (0089 `payments_received.bank_account_id`, rules in `shared/treasury/bank-account-reader.ts`: not for cash, active, same currency). `GET /bank-accounts/lookup` for sales/purchases users; shared web `BankAccountSelect`.
- **Supplier payments (new, Purchases)** — 0090 `supplier_payments` + allocations, PAY- numbering, draft → post → allocate later, `GET /supplier-payments/outstanding-invoices`. Accounting: Dr AP / Cr cash-bank. Purchase invoice page shows paid / outstanding.
- Historical receipts posted before this change have no journal entry (no backfill was done).

## Taxes (VAT blocker #1 — core done)
- **One engine**: `libs/shared-kernel/src/tax/tax-calculator.ts`, used by the API and the web (shared-kernel now has an ESM build and is a web dependency). VAT on net + table tax; table tax (T2) on net; withholding (T4) on net, deducted from the total; tax-inclusive prices backed out exactly; integer math, per-line rounding half away from zero.
- **0091** tax_rules: kind (vat/table/withholding), eta_type/eta_subtype, scope (sales/purchases/both). Seeds when empty: VAT 14% (T1/V009), exempt (V003), WHT 1% supplies (W002), 3% services (W004), 5% professional (W010). customers/suppliers `withholding_tax_rule_id`. GL: 218 table tax output, 219 WHT payable, 118 WHT receivable; mappings vat output 212 / input 116 / table out 218 / table in 55 / WHT payable 219 / receivable 118.
- **0092** invoice & credit-note lines store `net_amount` + `taxes` JSONB snapshot; invoices `prices_include_tax`. Defaults per line = product's tax rule + party's withholding; rules validated (active, scope, one per kind). `shared/taxes/*`.
- Posting: sales Dr AR + WHT receivable / Cr revenue, VAT out, table out; purchases Dr GRNI (stock net) + expense + VAT in + table in / Cr AP + WHT payable; credit notes reverse their share.
- **Fixes found on the way:** order-based sales invoices now bill the order's discounted price (discounts were lost); credit notes are priced at the invoiced price + taxes (were at order list price); POS invoices are tax-inclusive with exact line amounts (total = tender); entries dated on invoice date, local time (UTC dating moved midnight–3am postings to the previous day); Arabic entry descriptions with document numbers.
- Web: per-line tax picker (one per kind), live totals (net / table / VAT / withholding / total), "prices include tax" option, breakdown on invoice and credit-note pages, VAT return report (Accounting › Reports › إقرار القيمة المضافة, Excel export).
- Verified live: PINV with VAT + 1% WHT → Dr 217 200 / 116 28 / Cr 219 2 / 211 226; SO with 10% discount → INV net 90 + VAT 12.60; return of 1 → CN 22.50 + 3.15 reversing exactly; VAT return output 9.45 vs input 28.00.

## Tests
Unit 326 · integration 147 · e2e 24 — all pass (new: tax engine spec in shared-kernel, document-taxes int-spec, supplier-payments int-spec, payment listener spec, tax posting specs).

## Known gaps / next
- Sales invoice worksheet preview shows the order's list price (server bills the discounted price) — cosmetic.
- No VAT on quotations / orders / POS receipt display; purchase returns have no debit note (stock only); withholding 300 EGP threshold not automated.
- Next per go-live order: printing/PDF (invoice with tax breakdown, thermal POS receipt) → opening balances / import → production ops → ETA (tax snapshot already carries ETA codes).
