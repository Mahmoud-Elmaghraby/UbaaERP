# Sales Module — Competitor Research (CLAUDE.md §17.2 pass)

**Date:** 2026-08-30. Condensed pass (same standing requirement as done for Inventory/Purchases), done before writing Sales module code — on top of the mandatory ETA e-invoice spike (`claude/sales-einvoice-spike.md`), which already covered §8's own separate requirement.

## Systems examined

Daftra (regional/Egyptian reference, same as prior passes), ERPNext (Selling module), cross-checked against Odoo's well-known Quotation→SO→Delivery→Invoice flow (already familiar from the Purchases pass's mirror-image RFQ→PO→Receipt→Invoice flow).

## Baseline confirmed (already in CLAUDE.md §10 — no new finding)

`customers`, `quotations`, `sales_orders`, `deliveries`, `sales_invoices`, `payments_received` — this exact chain (quotation → order → delivery → invoice → payment) is the standard shape in every system examined, the mirror image of the Purchases chain already built (RFQ → PO → goods receipt → purchase invoice).

## Real gap found — proposal, not yet approved

**Sales returns / credit notes.** Both Daftra (إشعار مدين / "credit note") and ERPNext (`Credit Note`, `Sales Return`) treat this as a first-class document — a customer-initiated return that reduces what's owed on a posted sales invoice, referencing the original delivery. This is the exact mirror of **Purchase Returns**, which this codebase already built as an approved research-pass addition to Purchases (`claude/purchases-module-research.md`, approved 2026-08-29).

**Proposal:** add a `sales_returns` (or `credit_notes`) entity, tied to a delivery the same way `purchase_returns` ties to a goods receipt, once Sales reaches the equivalent build stage (after Deliveries, mirroring where Purchase Returns landed after Goods Receipts). **Not building this yet** — per CLAUDE.md §17.3, a new document type is a scope decision requiring explicit approval before being built, same as RFQ/Purchase Returns were. Flagging now so the decision is ready when Sales reaches that stage, not decided unilaterally in the meantime.

**Note from a later session: approved and built.** The user was asked directly whether Sales Returns should carry a real financial credit note ("إشعار دائن مالي حقيقي") and chose yes — built as Sales Returns (physical/operational) plus a new Sales Credit Notes entity (the financial counterpart, auto-generated on return confirmation). See `claude/sales-module-status.md` and `claude/accounting-module-status.md`'s Stage 6/7 section for the full picture.

## Note on POS mode

Master doc §9.2 calls for two Sales frontend modes (POS + full B2B cycle) sharing the same backend documents — confirmed as the right shape (Daftra's POS sessions still write ordinary sales invoices underneath). No new backend entity implied; this is a frontend/UX concern for when the Sales frontend stage is reached, not a backend design question now. **Note from a later session:** the Sales frontend was built as the standard B2B cycle (Customers/Quotations/Sales Orders/Deliveries/Sales Invoices/Payments Received/Sales Returns/Sales Credit Notes/ETA Credentials) — a dedicated POS mode screen was not built as part of that pass; if POS is still wanted, it remains open, unstarted frontend/UX work over the same backend documents.

## Status

Baseline entities (`customers`, `quotations`, `sales_orders`, `deliveries`, `sales_invoices`, `payments_received`) confirmed — proceeding to build these per CLAUDE.md §10, in that order, starting with `customers` (the foundational entity every later Sales document references, mirroring Suppliers' role in Purchases). Sales returns/credit notes stays a flagged, unapproved proposal.

**Note from a later session:** all baseline entities plus Sales Returns and Sales Credit Notes are now fully built, backend and frontend — see `claude/sales-module-status.md`. The Sales module is complete except for the still-deferred ETA e-invoice submission engine and the untouched POS-mode frontend.
</content>
