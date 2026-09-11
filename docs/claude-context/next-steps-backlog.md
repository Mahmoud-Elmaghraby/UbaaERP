# Next-Steps Backlog — Handoff Doc

**Written:** 2026-09-10. **Purpose:** this session is being wound down and work is continuing from a **new chat**. Everything the previous session explicitly asked for (Sales invoice-takeover orchestrator, its mirror onto Purchases) is done, verified natively, and committed. This doc exists so a fresh session — with none of that conversation history — can pick up any one of the open items below without re-deriving the context from scratch. It does not pick a priority; that's for the user to decide when the new chat starts. Each item below states what a new session should do first, so it doesn't have to rediscover it.

## Snapshot — what's already fully done (don't redo this)

- **Inventory** — backend + frontend complete (per `claude/inventory-module-status.md` / `claude/inventory-frontend-status.md`; note the frontend-status doc is flagged elsewhere as partly stale — it describes a redesign as "pending approval" when it's actually already live, so re-confirm against the repo rather than trusting that doc's wording literally).
- **Purchases** — backend + frontend complete, including the invoice-takeover orchestrator mirror (`PurchaseInvoicesService.create()` direct-invoicing + auto Goods-Receipt path), commit `41fe5af`. See `claude/purchases-module-status.md`.
- **Sales** — backend + frontend complete, including the invoice-takeover orchestrator (`SalesInvoicesService.create()`), commit `6fcc1ce`. See `claude/sales-module-status.md`.
- **Accounting** — Stages 1, 2, 2b, 3, 4, 5, 6, 7 all done, backend **and** frontend, native verification green (`typecheck`/`lint`/`build`/`test`, 294/294 tests). Only Stage 8 (Tax Returns) remains, and it hasn't been started. See `claude/accounting-module-status.md` (updated 2026-08-30) for full detail — it supersedes the older claim in `sales-module-status.md` that Accounting "has zero frontend"; that was true only before Accounting's own frontend pass.

Everything below is either an explicitly deferred/tracked gap, or work that's implemented but not yet confirmed verified/committed. None of it was picked as "the" next step — present all of it to the user and let them choose.

---

## 0. Sales POS (Point of Sale) — a whole feature, code-complete, sitting uncommitted (highest-value, closest to done)

**Source doc:** `claude/sales-pos-research.md` (last updated 2026-09-05).

**Current state:** all 5 planned build stages are **code-complete** — backend and frontend both — but **the user deliberately never committed any of it**, on purpose, to land it as one commit once the whole feature was finished:
- Cash sessions/shifts (`pos_sessions`, migration `0059`) + Cash Over/Short auto-posting to the GL.
- Discounts at both header and line level on Sales Orders (migration `0062`), backend + frontend.
- Walk-in/Cash Customer auto-provisioning (migration `0063`).
- `PosSalesService.checkout()` — the full Order→Delivery→Invoice→Payments orchestration in one atomic transaction, split/multi-tender support (this is the exact pattern the Sales/Purchases invoice-takeover orchestrators, built later, deliberately copied).
- The full `/pos` checkout screen (product search, cart, multi-tender, discounts) — a standalone sidebar item, not nested under Sales.
- X/Z session report (`GET /pos-sessions/:id/report`), backend + a report dialog on the frontend.

**What's actually missing:** per the doc's own "Status" section, only two things stand between this and being shipped: (1) the user running `pnpm typecheck && pnpm lint && pnpm build && pnpm test` natively for Stage 5's files specifically (everything earlier already passed native verification in its own stage), and (2) then committing the whole accumulated Stage 2–5 work as a single commit with the attribution footer. Nothing has been proposed or run for that commit yet.

**What a new session should do first:** run `git status` on the user's machine to confirm this work is still sitting there uncommitted (it may have moved since 2026-09-05), then walk through the Stage 5 native verification and the single commit, exactly as `claude/sales-pos-research.md`'s own "Status" section describes.

**Why it matters / urgency:** this is arguably the single highest-value, lowest-effort item in this whole list — a complete, working feature that just needs one verification pass and one commit to stop being "at risk of being lost." It's also the specific uncommitted work that `claude/settings-module-audit.md` §7 flagged (without detail) as "an unrelated block of uncommitted Sales/POS work sitting in the same working tree" — that flag and this doc are describing the same thing.

---

## 1. Settings module hardening — closest to done, but carries real risk of being lost

**Source doc:** `claude/settings-module-audit.md` (last touched 2026-09-06).

**Current state:** per the audit doc, hardening work (new deps `@nestjs/throttler`, `helmet`, `cookie-parser`; migrations `0065`–`0068`) is described as **implemented**, but:
- No confirmation `pnpm install` was actually run for the three new dependencies.
- No confirmation migrations `0065`–`0068` were applied to any real schema.
- No confirmation `pnpm typecheck && pnpm lint && pnpm test` were run against this work specifically.
- Two open production-readiness questions were never resolved: (a) a real outbound-email provider to replace `ConsoleEmailSender`, (b) confirming the hosting-topology assumption behind using `SameSite=Lax` cookies.
- The audit doc itself, as of 2026-09-06, flagged a **substantial block of uncommitted work sitting alongside it in the same working tree** — it is not confirmed whether any of this was ever committed.

**What a new session should do first:** on the user's machine, run `git status` / `git log` in the repo to find out what's actually committed vs. still sitting uncommitted, before assuming anything about this item's state. Then read the full audit doc for the itemized checklist.

**Why it matters / urgency:** this is implemented-but-unverified work sitting in a working tree — the kind of thing that's easy to accidentally lose (a `git stash`, a branch switch, a machine reset) if it isn't verified and committed soon. Of all six items here, this is the one with the highest "risk of silent loss" if left untouched much longer.

---

## 2. GoodsReceiptsService → Outbox symmetry (deferred architecture gap)

**Source:** discovered and deliberately deferred while building the Purchases invoice-takeover orchestrator (commit `41fe5af`); documented in `PurchaseInvoicesService`'s own class comment and in `claude/platform-flexibility-strategy.md`.

**Current state:** in Sales, `DeliveriesService.confirm()` writes its integration event (`sales.delivery.confirmed`) to the Outbox in the same transaction as the status change. In Purchases, `GoodsReceiptsService.confirm()` does **not** — `GoodsReceiptsController.confirm()` still publishes `purchases.goods_receipt.confirmed` on the plain `EventEmitter2`-based Event Bus, after the transaction commits, the older pattern used everywhere before Accounting's Stage 6/7 upgraded Sales' events to Outbox. The Purchases orchestrator worked around this narrowly (injecting `PurchasesEventPublisher` into `PurchaseInvoicesService` to replicate the controller's publish call) rather than fixing the root asymmetry.

**What a new session should do first:** read `GoodsReceiptsService.confirm()` and `GoodsReceiptsController.confirm()` to confirm the current shape is still as described, then read how `DeliveriesService.confirm()` was upgraded to Outbox (Accounting's Stage 6/7 work, see `claude/accounting-module-status.md`'s "Two technical problems solved first" section) as the template for the same change here.

**Why it matters:** not a live bug today — the workaround in `PurchaseInvoicesService` covers the one caller that needed it. But it's an inconsistency between two structurally-identical modules, and any *future* code that calls `GoodsReceiptsService.confirm()` directly (bypassing the controller) would silently lose the event, exactly the class of bug the Purchases orchestrator had to work around once already.

---

## 3. PlanFeatureGuard coverage gap (cross-module)

**Source:** flagged repeatedly across module status docs (Purchases, Sales, Accounting) as a tracked, not-module-specific gap.

**Current state:** CLAUDE.md's rule (§6) is that any endpoint belonging to an optional module must enforce `PlanFeatureGuard`. In practice this is inconsistently applied — some controllers have it (e.g. Purchases' `RfqsController`, `SupplierQuotationsController`, `PurchaseOrdersController`, `GoodsReceiptsController`), others explicitly don't (`PurchaseInvoicesController`, `PurchaseReturnsController`, and others — each doc says which, with a stated reason or "tracked, not forgotten").

**What a new session should do first:** grep the whole `apps/api/src/modules/**/presentation/*.controller.ts` tree for `@UseGuards` to build a real current inventory of which controllers have `PlanFeatureGuard` and which don't, then cross-reference against `FEATURE_KEYS` (`apps/api/src/shared/plans/feature-catalog.ts`) to see which optional-module endpoints are actually ungated. Don't assume the per-module docs are fully up to date — verify against the repo directly.

**Why it matters:** this is a security/business-rule gap, not just tech debt — an ungated endpoint for an optional module could let a tenant use a feature their plan doesn't include, and CLAUDE.md is explicit that frontend-only feature hiding is not sufficient enforcement (§6).

---

## 4. Accounting Stage 8 — Tax Returns (needs its own research pass first)

**Source:** `claude/accounting-module-status.md`, "What's left" / "Next" sections; `claude/accounting-module-research.md` for the original roadmap.

**Current state:** not started. Per the module's own established pattern (every other module got a competitor-research pass before any build work — see `claude/*-module-research.md` for each), Tax Returns needs a dedicated research pass first, because it's genuinely Egypt-tax-specific and adjacent to the still-separately-deferred ETA e-invoice work (`claude/sales-einvoice-spike.md`).

**What a new session should do first:** read `claude/accounting-module-research.md` for whatever it already captured about Stage 8's scope, and `claude/sales-einvoice-spike.md` to understand the ETA e-invoice adjacency, before starting research — don't start from zero if either already has relevant groundwork.

**Why it matters:** this is the one remaining item in Accounting's own roadmap, and per CLAUDE.md §10's fixed build order, Accounting is formally "the next module" — so this is the closest thing to an official next step, it's just gated on research rather than ready to build directly.

---

## 5. Accounting manual UI pass (verification gap, not new work)

**Source:** `claude/accounting-module-status.md`, "Still not verified" / "Next" sections.

**Current state:** Stage 4/5 (Cost Centers, Bank Accounts) passed `typecheck`/`lint`/`build`/`test` natively, but nobody has actually clicked through the screens in a running browser yet. Two specific things need a human hand on the keyboard:
- Walk the Cost Centers and Bank Accounts screens end-to-end, including the register/reconciliation flow, against a real running backend.
- Specifically test reversing a journal entry with the `reversalDate` field left blank — there's a suspected bug in `journal-entry-reverse-form.tsx` (Zod's `.optional()` only skips `undefined`, never `''`, and React Hook Form defaults an untouched field to `''`) that was reasoned about from Zod/RHF semantics but never actually triggered in a browser.

**What a new session should do first:** this doesn't need code investigation — it needs the user to run `pnpm --filter api start:dev` + `pnpm --filter web dev` locally, log in, and click through; a new session's job here is mostly to walk the user through it and fix whatever the `reversalDate` test turns up.

**Why it matters:** low effort, quick to close out, and it's the only way to confirm or rule out a real (if minor) UI bug that's been flagged twice now without ever being exercised.

---

## 6. No tests written (standing gap, every module)

**Source:** repeated in every module status doc as an explicit, deliberate deferral, not an oversight.

**Current state:** per CLAUDE.md §10, the testing strategy is defined (unit tests without a DB for domain/application, integration tests against a real test DB for repositories, focused e2e for critical business flows) but has not actually been applied anywhere yet — every module status doc says "no tests written" as a standing, acknowledged gap.

**What a new session should do first:** this is a large, cross-cutting effort, not a single task — a new session should ask the user which module/flow to start with (e.g. the financial-critical ones — Journal Entries posting, Sales/Purchases Invoice posting, the two invoice-takeover orchestrators just built — are the highest-value candidates given CLAUDE.md's own emphasis on financial correctness) rather than trying to cover everything at once.

**Why it matters:** this is the largest single gap against CLAUDE.md's own stated engineering rules (§10), but it's also the least urgent in the "might get lost" sense — unlike item 1, there's no uncommitted work at risk; it's simply not started.

---

## How to use this doc in a new chat

A new session should treat this file as its starting context for "what's next" — read it, then read whichever module status doc(s) it links to for the item the user picks, then verify current repo state directly (git log/status, a targeted grep) before writing any code, per CLAUDE.md's own rule to inspect the existing project before coding. This doc was deliberately written to present options, not pick one — the choice of which item to tackle first is the user's.
