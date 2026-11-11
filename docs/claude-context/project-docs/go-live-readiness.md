# Go-live readiness — what's missing before the first real customer (assessed 2026-10-06, status updated 2026-10-08)

Assessed by reading the code on branch state after the UI redesign (commit f3ca091 + main.ts filter fix), not from the status docs alone. "Verified" = confirmed by grep/reading code.

## Status update 2026-10-08
- **#1 VAT — core DONE** (see `claude/taxes-and-payments-2026-10-08.md`): VAT / table tax / withholding on sales & purchase invoices and credit notes, posted to tax accounts, VAT return report. Remaining: taxes on quotations/orders display, POS receipt tax display, purchase debit notes, WHT threshold automation.
- **#3 Supplier payments — DONE** (and customer receipts now actually post to the ledger — they never did before).
- **#2 Printing / PDF — next.**
- #5 partial: product import from Excel + opening stock exist (inventory step 4); account/customer/supplier opening balances still missing.

## Blockers — can't sell to an Egyptian company without these
1. **VAT / taxes on invoices** — core done 2026-10-08 (see above).
2. **Printing / PDF — none in the web app (verified, no print code in apps/web).** `document_templates` exist in Settings but aren't wired to any document. Needed: A4 invoice/PO/quotation/receipt PDF with company data, tax number, totals in words; thermal receipt for POS.
3. **Supplier payments** — done 2026-10-08.
4. **ETA e-invoice (legal, Article 35) — only credential storage exists.** Signing, submission, status sync, QR on printouts; e-receipt for POS. Line tax snapshots now carry ETA tax type/subtype codes. Needs a real registered taxpayer for sandbox testing.
5. **Onboarding data — opening balances & import.** Product import + opening stock done; opening balances for accounts (possible today only via manual journal entry), customer/supplier opening balances still missing.
6. **Production operations.** Hosting decision still deferred (CLAUDE.md §12); no production Dockerfile/CD; HTTPS/domain; backups + restore drill; **real email provider** (`ConsoleEmailSender` — password-reset emails only print to the server console, verified); error monitoring. Tenants are created only via CLI scripts (`db:provision`, `db:seed-owner`) — needs a minimal platform-admin screen.
7. **Product name** — "أصول" collides with OSOL (CLAUDE.md §17.4); must be final before marketing.

## Important in the first weeks
- Customer & supplier statements and receivables/payables aging (verified missing; GL, trial balance, income statement, balance sheet, cash flow exist).
- Automated tests on financial flows (Sales/Purchases/Accounting/Inventory); align `test/e2e/app.ts` filters with `main.ts`.
- ~~Stocktake / inventory count~~ (done in inventory steps 3–4).
- Short Arabic user guide + onboarding checklist.

## Later
POS touch redesign, dashboard money KPIs, convert remaining documents to the full-page layout, fixed assets, bank statement import/reconciliation, multi-currency phase 4, WhatsApp sending.

## Recommended order
~~VAT~~ → printing → ~~supplier payments~~ → opening balances/import → production ops (email, tenant admin, deploy, backups) → ETA (start research in parallel; needs a real taxpayer). Statements/aging alongside printing.
