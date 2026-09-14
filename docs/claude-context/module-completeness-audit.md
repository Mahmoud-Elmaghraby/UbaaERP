# Full Module Completeness Audit — vs. Large-ERP Standards

**Date:** 2026-09-11. This is Item (3) of the four-item 2026-09-11 refactor initiative (see `claude/next-steps-backlog.md`'s top callout): "a comprehensive review of Settings/Inventory/Purchases/Sales/Accounting against their own status docs and against large-ERP feature sets." Item (1) (error handling + Arabic i18n) is done. This doc is Item (3). Item (2) (multi-currency research) and Item (4) (CLAUDE.md autonomy clause) are separate — Item (4) is already done; Item (2) is still open and this doc treats multi-currency as a cross-reference only, not a full design.

## Methodology

Two inputs were combined:

1. **Internal status re-read.** Every module status/research doc in this project (`settings-module-status.md`, `inventory-module-status.md`, `purchases-module-status.md`, `sales-module-status.md`, `accounting-module-status.md`, and their `*-module-research.md` counterparts, plus `platform-flexibility-strategy.md`) was re-read in full to build an accurate, current picture of what is actually built, what is explicitly deferred, and what is already tracked as a known gap. These docs are unusually disciplined about this already — several rounds of prior competitor research (Daftra, Wafeq, Odoo, ERPNext, Zoho, SAP Business One, Dolibarr) are already baked into the build decisions, and stale claims have been caught and corrected before (see `next-steps-backlog.md`'s correction callouts). This audit does not re-litigate anything already decided-and-approved or already-flagged-and-tracked in those docs — it cross-references against them and reports only what changes the picture.
2. **Fresh competitor research**, done for this audit specifically, targeting categories the existing per-module research passes had not yet covered in depth: platform-wide/cross-cutting capabilities (dashboards, notifications, attachments, approvals, import/export), plus a second pass on Inventory/Purchases and Sales/Accounting checking specific large-ERP-standard capabilities not yet assessed. Benchmarked against Odoo, SAP Business One, Microsoft Dynamics 365 Business Central, NetSuite, ERPNext, and the regional references already used throughout this project (Daftra, Wafeq).

**What this audit is not:** a request to build anything. Per CLAUDE.md §17.3, research and proposals are always welcome; anything below is a candidate for the user to prioritize, not a decision. Nothing here overrides a [مستقر] architectural decision or the fixed six-module scope from the master document.

## Part 1 — Already-tracked internal gaps (not new; consolidated here for one view)

These are gaps the project's own status docs already identified and flagged — repeated here only so this audit gives a single complete picture, not because they're new findings.

| Module | Gap | Status |
|---|---|---|
| Accounting | Tax Returns (Stage 8) | Not started; needs its own Egypt-specific research pass before any build work |
| Accounting | "For-review" staging for auto-posted journal entries | The platform's own master doc (§9.2) calls for this as an optional tenant setting; all 5 auto-posting handlers currently create-and-post immediately with no staging toggle |
| Accounting | `purchaseExpenseAccountId` mapping | Starts NULL by design (no safe default); purchase-invoice auto-posting throws until a tenant admin configures it — not a bug, but easy to mistake for one |
| Purchases | `GoodsReceiptsService.confirm()` not on the Outbox pattern | Architecture inconsistency vs. `DeliveriesService.confirm()` (Sales' equivalent), worked around narrowly for the invoice-takeover orchestrator but not fixed at the root |
| Sales | ETA e-invoice submission engine | Only credential storage is built; the actual signing/submission engine is blocked on needing a real registered Egyptian taxpayer entity to test against |
| Inventory | Reordering rules with automatic purchase-request generation | Was blocked on Purchases not existing — **Purchases now exists, so this is unblocked and newly actionable** (see Part 3) |
| Inventory | MinIO product-image upload | Master doc calls for this starting with Inventory; not started at all — turns out to be part of a bigger gap, see Part 2 |
| Accounting | `reversalDate` suspected bug in `journal-entry-reverse-form.tsx` | Reasoned from Zod/RHF semantics, never confirmed in a browser — a quick manual check, not a research item |
| Settings | Two open production-readiness questions | A real outbound-email provider (still `ConsoleEmailSender`), and confirming the hosting-topology assumption behind `SameSite=Lax` cookies |
| All of Sales/Purchases/Accounting/Inventory | No automated tests | Only Settings and Users-Permissions have real test coverage; the other four modules have zero, an explicit standing deferral, not an oversight |
| All optional documents | Multi-currency / FX | No FX-conversion layer anywhere; journal entries are single-currency by design. This is Item (2) of the refactor initiative, separately scoped — see Part 3 for why it should probably be prioritized higher than "just a research item" |

## Part 2 — New findings from this audit's competitor research

Organized by how central each capability is to being called a "complete" or "large" ERP, based on what Odoo, SAP Business One, Business Central, NetSuite, ERPNext, Daftra, and Wafeq actually ship.

### Confirmed table-stakes (every large ERP examined has this; genuine gaps here)

1. **Dashboard/KPI home screen.** Every system examined (Odoo, SAP B1, Business Central, NetSuite) gives the user a role-based or customizable dashboard on login. Nothing in this platform's status docs mentions one existing anywhere. This is the single most visible gap for anyone evaluating the platform against "large ERP" expectations — a functionally complete backend with no landing-page overview reads as unfinished even when it isn't.
2. **Generic file/document attachments.** This turned out to be bigger than the already-tracked "MinIO product-image upload" gap. Every competitor treats attaching an arbitrary file (a scanned invoice, a signed contract, a supplier's certificate, a photo) to *any* record as core infrastructure (Odoo's chatter, Business Central's `documentAttachment` API). Since MinIO integration hasn't started at all, this platform very likely has **no attachment capability anywhere**, not just on products — worth treating as a cross-cutting infrastructure gap (one shared attachment mechanism reusable by every module) rather than an Inventory-specific one.
3. **In-app notification/alert engine.** Beyond the already-discussed WhatsApp integration (a *channel*), the real gap is a rule-based internal engine — "notify user X when Y happens" (low stock, an overdue invoice, a pending approval). SAP B1's Alerts & Approval Procedures and Odoo's Activities/follow system both treat this as core, not optional.
4. **Bulk import/export (CSV/Excel).** Both Daftra and Wafeq — the platform's own closest regional competitors — have well-developed import/export (Daftra: journal entries, invoices, assets, products; Wafeq: contacts, invoices, expenses, inventory). If this platform has none, it's a gap relative to the *regional* competition specifically, not just the global enterprise tier.
5. **Stocktake / cycle counting.** Genuinely absent from the Inventory feature list, and standard in every system examined (Odoo's Cycle Counts, SAP B1/Business Central/NetSuite's physical-inventory-count documents with variance-to-GL posting). Given lot/serial tracking and the Event Bus/Outbox infrastructure already exist, this should tie in cleanly — a count would just be another stock-movement source feeding the same weighted-average engine and, eventually, the same Accounting auto-posting pattern already proven for COGS.
6. **Fixed asset register + depreciation.** Standard in every ERP examined (Odoo native, SAP B1's dedicated module, ERPNext's Asset doctype). More important for this platform specifically than it might otherwise be, since Egyptian tax/financial reporting for any company owning equipment, vehicles, or property expects this — arguably as core as Tax Returns (Stage 8), which is already on the roadmap.

### Confirmed important-for-this-market specifically

7. **Multi-currency / FX revaluation.** Already Item (2) of the approved refactor initiative, so this isn't a new finding — but the research sharpens its priority. Odoo/NetSuite/Business Central all treat this as standard, but the more relevant point is that Egyptian import/export trade runs heavily in USD/EUR with a volatile EGP, making this more commercially important here than in a stable-currency market. Worth treating as higher-priority than a generic "nice to have" research item.
8. **Bank statement import / auto-reconciliation.** The built Bank Accounts feature (manual reconcile/unreconcile toggle) was explicitly scoped as "not full statement-import reconciliation" from the start — this research confirms that gap is real and standard elsewhere (NetSuite, Odoo, Business Central all support bank feeds), not just a nice-to-have.

### Confirmed real but lower priority (enterprise-tier, sector-dependent, or genuinely optional elsewhere too)

9. **Multi-step/conditional approval workflows** (amount-based routing, multiple approvers) — standard in NetSuite/Business Central at their tier, but the flat one-manager chain this platform has is a reasonable SMB/mid-market baseline, not a glaring omission. Worth a roadmap entry, not urgent.
10. **Inventory valuation method choice** (FIFO/Standard costing alongside weighted-average) — sector-dependent; weighted-average-only is acceptable for most SMB/mid-market tenants. Worth a backlog note, not urgent.
11. **Kitting/bundles** (a lightweight BOM: a "product" that explodes into component stock movements at sale time, no work orders) — genuinely useful and lighter-weight than a manufacturing module; several systems (Odoo, SAP B1) support this as a simple flag distinct from full manufacturing. Worth flagging as a scoped, contained addition to Inventory if ever revisited.
12. **Budgeting / budget-vs-actual** — present but often thin even in big systems (Odoo's native budget module is weak enough that third-party add-ons compensate for it); a simple version is the norm, not a sophisticated one.
13. **Cash Flow Statement** — conceptually one of the three canonical financial statements, but Odoo itself gates it behind its paid Enterprise edition, so it's more "premium tier" in practice than universal. Can likely be derived from existing General Ledger data without new domain concepts (direct or indirect method) — a contained addition to `AccountingReportsService`, not a new subsystem.
14. **Global cross-module search** — a nice usability layer (search customers/invoices/items from one box), present in ERPNext and generally expected, but not something that blocks calling the platform "complete."
15. **3-way matching quantity/price tolerance enforcement** — worth a quick verification pass (not full research) that the existing invoice-takeover orchestrator's quantity caps actually behave like the tolerance-based 3-way matching NetSuite/Business Central treat as a standard AP control, rather than just a hard quantity ceiling.

### Confirmed NOT gaps — deliberately excluded, validated by real vendor precedent

16. **CRM/lead-opportunity stage before Quotation.** Every system examined (Odoo, SAP B1, NetSuite, Dynamics 365) treats this as a *separate product/module*, not a fused step of the sales flow — Odoo CRM is its own installable app; Dynamics 365 splits Sales (CRM) from Business Central (ERP) entirely. The platform's design (sales flow starts at a known customer) matches standard practice, not a shortfall.
17. **Recurring/subscription billing.** Everywhere examined, this is a distinct add-on module (Odoo Subscriptions, NetSuite SuiteBilling), never baseline sales functionality. The existing decision to defer this is standard practice, not a compromise.
18. **Year-end closing via a formal closing journal entry.** This audit specifically checked whether the platform's "computed memo, never a posted closing entry" design (Balance Sheet's `currentYearEarnings` line) is a shortcut. It is not — NetSuite's own documentation explicitly recommends *against* posting formal closing entries and computes retained earnings the same way this platform already does. (ERPNext does use a formal Period Closing Voucher, so both approaches exist in production systems — but the platform's current approach is validated by a major vendor's own recommended practice, not a compromise made for lack of time.) **Reclassify from "gap" to "confirmed acceptable design."**

## Part 3 — Consolidated priority view

Combining Part 1 (already-tracked) and Part 2 (new), grouped by how actionable and how impactful each item is. This is a suggested lens for the user's own prioritization, not a ranking Claude is imposing.

**High-value and relatively contained (good candidates for a near-term pass):**
- Reordering rules → auto purchase-request generation (Inventory ↔ Purchases) — already unblocked, was only waiting on Purchases existing
- A shared file/document attachment mechanism (the real scope behind "MinIO product-image upload") — infrastructure other modules would immediately benefit from once it exists
- Cash Flow Statement — likely derivable from existing General Ledger data, contained to `AccountingReportsService`
- Fixed asset register + depreciation — standard, and relevant to Egyptian compliance; a natural sibling to the already-planned Tax Returns (Stage 8) research

**High-value but larger or more architecturally involved:**
- Multi-currency / FX (Item 2 of the refactor initiative — already scheduled, this audit just reinforces its priority)
- A dashboard/KPI home screen — no backend gap, but touches every module's data and needs its own design conversation (what KPIs, per-role or global)
- Bank statement import / reconciliation — needs a design decision on statement formats/matching rules
- In-app notification/alert engine — cross-cutting, would need its own delivery-mechanism design (similar to how Outbox was designed once, reused everywhere after)
- Stocktake / cycle counting — ties into the stock-movement/costing engine, should be designed carefully against the existing weighted-average/lot-tracking machinery

**Worth a backlog line, not urgent:**
- Bulk import/export (CSV/Excel)
- Multi-step/conditional approval workflows
- Inventory valuation method choice
- Kitting/bundles
- Budgeting/budget-vs-actual
- Global cross-module search
- Quick verification of 3-way-matching tolerance behavior in the existing orchestrator

**Already tracked, no new information changes their status:**
- Tax Returns (Stage 8), "for-review" staging for auto-posted entries, `GoodsReceiptsService` Outbox symmetry, ETA submission engine, `reversalDate` UI check, Settings' two open production questions, missing tests across four modules

**Confirmed non-gaps (do not build without a real reason to revisit):**
- CRM/lead stage before Quotation
- Recurring/subscription billing
- Year-end closing via formal closing entry (current memo-based approach is validated, not a shortcut)

## Next steps

This is a research/prioritization document, not a build plan. Suggested next conversation with the user: pick one or two items from the "high-value and relatively contained" list to scope properly (each would get its own short design note before any code, per CLAUDE.md's own process), or proceed instead to Item (2) of the refactor initiative (multi-currency design), which this audit's research suggests deserves real priority given the Egyptian/MENA trade context.
