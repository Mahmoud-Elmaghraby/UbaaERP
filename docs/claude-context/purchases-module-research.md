# Purchases Module — Competitor Research (CLAUDE.md §17.2 pass)

**Date:** 2026-08-29. Done before writing any Purchases code, per the standing process rule (research before/while building each module, same as done for Settings and Inventory).

## Systems examined

- **Daftra** (دفترة) — same regional/Egyptian reference used in the earlier Settings-phase research pass.
- **Wafeq** — same Saudi reference used before.
- **Odoo** (Purchase app) — global open-source reference, generally the most feature-complete purchasing flow of the group.
- **ERPNext** (Buying module) — global open-source reference, widely used in Arabic-market deployments too.
- **Zoho Inventory / Zoho Books** — global SaaS reference.

## Baseline confirmed (already in CLAUDE.md §10's Purchases entity list — no new finding, just cross-checked)

`suppliers`, `purchase_requisitions`, `purchase_orders`, `goods_receipts`, `purchase_invoices`, optional three-way matching, optional approval chains, optional multi-currency per supplier — all of this is standard and confirmed present in every system examined.

## Real gaps found (not in the master doc's Purchases entity list) — **APPROVED BY USER 2026-08-29, add both to this sprint's entity design**

1. **RFQ / supplier-quotation stage.** Every system examined has a distinct step, before the purchase order, where quotes are requested from (typically several) suppliers and compared:
   - Daftra: "Quotation Requests" → "Purchase Quotations" (suppliers reply with a priced quote, valid-until date) → then a PO is raised against the chosen quote.
   - Odoo: the purchase order document itself *starts life* as an RFQ (`state: draft` = RFQ, confirmed = PO) — RFQ is not an optional add-on there, it's the primary document.
   - ERPNext: `Request for Quotation` and `Supplier Quotation` are two distinct documents ahead of `Purchase Order`.
   - **Decision:** add as formal entities alongside the master doc's existing Purchases list — a request-for-quotation document and supplier-quotation-response document, sitting between `purchase_requisitions` and `purchase_orders`.

2. **Purchase returns / debit notes.** Present as a first-class document in ERPNext (`Debit Note`), and in conventional accounting-ERP practice generally (Tally, Manager.io, Oracle JD Edwards all document this explicitly). Mirrors what Sales will eventually need for customer returns.
   - **Decision:** add as a formal entity — a purchase-return/debit-note document referencing a `goods_receipts` record (what physically goes back) and reducing what's owed on the related `purchase_invoices` record.

## Secondary findings (lower priority, background only — NOT approved, deferred)

- **Partial/multi-stage goods receipt**: Zoho and ERPNext both treat "receipt" as its own document, separate from the PO, explicitly supporting more than one receipt against a single PO (partial deliveries). This should simply inform the schema design of `goods_receipts` (one PO → many receipts) — not a separate feature decision.
- **Vendor-specific pricing / supplier item references** (Odoo "supplier reference", ERPNext price lists) — nice-to-have, not core.
- **Blanket / recurring purchase orders** (Odoo "blanket order agreement").
- **Supplier scorecards** (ERPNext) — periodic supplier performance rating. Pure analytics.
- **Drop-shipping** (Zoho) — ships supplier → end customer directly, bypassing the tenant's warehouse. Touches Sales too; out of scope until Sales exists.
- **Vendor advance/prepayment tracking** — Daftra has a simple "already paid" field on the purchase invoice. Full payment tracking belongs with Accounting (not built yet); may end up as a simple field on `purchase_invoices` later, not a subsystem.

## Explicitly checked and found to be a non-issue

Egyptian e-invoicing (ETA) has no purchase-side/buyer obligation — it applies to the *issuer* of an invoice, i.e. Sales (§8), not Purchases. No gap here.

## Status

Research approved 2026-08-29: **RFQ/supplier-quotation** and **purchase returns/debit notes** are now part of this sprint's Purchases entity design, added to the master doc's baseline list (`suppliers`, `purchase_requisitions`, RFQ, supplier quotations, `purchase_orders`, `goods_receipts`, purchase returns/debit notes, `purchase_invoices`). Everything under "Secondary findings" stays deferred/background, not approved.
