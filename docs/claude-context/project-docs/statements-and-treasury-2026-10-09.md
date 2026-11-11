# Statements & Treasury — 2026-10-09

The user asked for a "traditional" product for most customers. They don't use taxes or the Accounting module. They need a cash-box (treasury) module that links to accounts only when Accounting is enabled, and customer statements that work without Accounting.

Commits on the cloud clone: `48d86f5`, `c09eefe`, `0b6730a`. Not pushed.
- Delivered to `M:\Projects\erp-platform` as `ubaa-update-2026-10-09-statements-treasury.tgz`, extracted and checksum-verified.
- The old `shared/treasury/bank-account-reader.ts` was deleted there with the user's approval. It was renamed to `treasury-reader.ts`.
- Migrations: 0094, 0095.

## 1. Accounting off really means off (bug fix)
- **Problem:** the Accounting outbox listeners never checked whether the module was enabled.
  - A tenant with Accounting off got journal entries anyway.
  - Or, with no mappings, it got endless `MAPPING_MISSING` retries.
- **Fix:** `@OnOutboxEvent(event, { requiresFeature })` together with `OutboxFeatureGateRegistrar` (PlansModule).
  - The handler becomes a no-op for that tenant.
  - The event is still marked processed.
  - All Accounting handlers are gated (CLAUDE.md §2.6).
- GET routes of Accounting stay readable when the toggle is off. That is existing PlanFeatureGuard behaviour.

## 2. Opening balances, statements, aging (no Accounting needed)
- **Opening balance fields:** `customers` / `suppliers` get `opening_balance_amount` (signed), `opening_balance_currency` and `opening_balance_date` (migration 0094).
- **`shared/statements`:** one implementation for both party kinds.
  - running statement
  - balance-forward aging (FIFO; independent of allocations)
  - opening-balance set, plus the outbox event
- **Ledger sources:** Sales and Purchases each provide a `PartyLedgerSource` built from their own documents.
  - Customer: posted invoices (POS included), credit notes, posted receipts.
  - Supplier: posted purchase invoices, posted payments.
  - Purchase returns have no money effect yet: there is no debit note.
- **API:**
  - `GET /customer-balances`
  - `GET /customers/:id/statement?from&to&currency`
  - `GET|PUT /customers/:id/opening-balance`
  - Supplier mirrors of all three.
- **Accounting (if enabled):** posts only the *difference* of an opening-balance change against opening-balance equity.
- **Central print service:**
  - New optional `ledger` section.
  - Print providers now receive the request query (period).
  - New document types `customer_statement` and `supplier_statement`.
- **Web:**
  - `/sales/customers/:id/statement` and `/purchases/suppliers/:id/statement`: period filter, opening-balance dialog, print, Excel.
  - `/sales/receivables` and `/purchases/payables`: aging buckets.
  - "كشف حساب" action added to the customer and supplier lists.

## 3. Treasury module (`modules/treasury`, core, not plan-gated)
- **Migration 0095:**
  - `bank_accounts` is renamed to `treasuries`. Ids are kept; `kind` (cash/bank/wallet) and `code` are added; the chart account is now optional.
  - Main cash box `CASH-01` is created and linked to the cash account when one exists.
  - `payments_received.bank_account_id` and `supplier_payments.bank_account_id` become `treasury_id`. Old cash rows move to the main cash box.
  - New `pos_sessions.treasury_id`.
  - New tables `treasury_categories` (seeded: rent, utilities, salaries…, linked to default accounts 52x/44) and `treasury_vouchers` (expense/income/transfer; posted on create; cancel requires a reason).
  - New permissions `treasury.view`, `treasury.manage`, `treasury.vouchers.manage`.
- **Integration without imports:**
  - **`TreasuryMovementRegistry` (shared):**
    - Sales registers receipts and POS cash differences.
    - Purchases registers supplier payments.
    - Treasury registers its own vouchers.
    - Balances and statements are computed from all registered sources.
  - **Receipts, payments and POS:** take an optional `treasuryId`. Without one, a cash document goes to the default cash box.
  - **Accounting:**
    - `resolveTreasuryAccount`: use the treasury's own account, else fall back to the cash / default bank mapping.
    - Applied to receipts, payments, POS variance and vouchers.
    - New listeners: `treasury.voucher.posted` / `.cancelled` (reverse entry) and `treasury.treasury.opening_balance_set`.
    - The bank register / reconciliation now reads GL-linked treasuries. CRUD moved to Treasury: Accounting's create/update/delete endpoints were removed, and its web page is now "المطابقة البنكية".
- **Print:**
  - `treasury_voucher`: A4 and 80 mm, amount in words.
  - `treasury_statement`.
- **Web:**
  - `/treasury`: cards with live balances.
  - `/treasury/:id`: statement.
  - `/treasury/vouchers`: create, print, cancel.
  - `/treasury/categories`: chart-account picker, shown only when Accounting is on.
  - Treasury picker added on receipts, supplier payments and POS open-session.

## Verified
- **Full API suite:** 531 tests pass. Coverage includes new e2e suites for statements (including the Accounting on/off gate, on its own tenant) and for treasury (vouchers, balances, statement, cancel, print, permissions, journal entries).
- **Other suites:** desktop 8 and shared-kernel 30 pass.
- **Typecheck and lint:** clean.
- **Live dev tenant:**
  - Journal entries checked: opening balance 111/35; expense 522/111; income 111/44; transfer 112/111; cancellation reversal.
- **Screenshots checked:**
  - treasury list, statement, voucher form, vouchers, categories
  - voucher print
  - payment form with the treasury picker
  - customer statement, print, receivables

## Known gaps / next
- No negative-balance guard on cash boxes.
- No purchase debit note, so purchase returns don't reduce what we owe.
- Opening balances can't be imported from Excel yet.
- No "hide taxes" setting yet; it was proposed.
- `apps/web/.../bank-accounts/bank-account-form.tsx` is now unused. It was kept because file deletion needs approval.
