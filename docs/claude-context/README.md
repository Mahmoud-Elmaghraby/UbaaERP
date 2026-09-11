# Claude Context Docs

**Purpose:** this folder is a local, in-repo mirror of the working docs Claude (via the "ERP system" Claude Project) keeps about this codebase's build history, decisions, and status — settings/permissions, inventory, purchases, sales, accounting, and the cross-cutting Plan/feature-flexibility work. It exists so that starting a fresh Claude session (on this account or a different one) with just this repo attached is enough to pick up full context, without needing access to the Claude Project itself (which is tied to one account/organization and doesn't transfer automatically to a different account).

**Source of truth:** the Claude Project ("ERP system") is still the live, actively-updated copy — any future session working from that Project will keep writing there. This folder is a point-in-time export, originally generated 2026-08-31 and **refreshed 2026-09-10** (added the 4 files below that didn't exist yet at the first export; the original 10 files were re-checked against the Project and are still byte-identical, so they were left untouched). If you're continuing work from the Project directly, these files may drift slightly behind it over time — ask whichever session is working to re-export this folder after a significant milestone if you want it kept current.

**How to use this with a new Claude session:** attach/open this repo, then point the session at this folder (`docs/claude-context/`) and ask it to read these files before starting — that gives it the same grounding the Project docs give a session with Project access. **Start with `next-steps-backlog.md` first** — it's the newest file and is specifically written as a handoff: it names the open items, what state each is actually in, and what a new session should check before touching code.

## Files, in build order

1. **`settings-module-status.md`** — Step 1: Settings + Users & Permissions. Fully done, tested, committed. Also carries environment notes for working with this repo through a device-bridge session (pnpm on PATH, NTFS-junction issues, git identity, etc.) — worth reading first if you're picking this repo up via a bridge/remote-shell setup.
2. **`inventory-module-status.md`** — Step 2: Inventory backend. Done, verified against real Postgres. Documents a real migration-ordering bug (permission grants) worth knowing about before adding new permission-gated modules.
3. **`inventory-frontend-status.md`** — Step 3: Inventory frontend + the navigation/visual redesign proposal that later became the standard pattern (route-per-entity, per-entity folders) for every module after it.
4. **`purchases-module-research.md`** — Competitor research behind Purchases' scope (RFQ/Supplier Quotations, Purchase Returns added on top of the master doc's baseline).
5. **`purchases-module-status.md`** — Step 3: Purchases, backend + frontend, all 7 entities. Introduces the Outbox Pattern (first genuinely financial document, Purchase Invoices) — this is the shared infrastructure Sales and Accounting both build on later.
6. **`sales-einvoice-spike.md`** — Mandatory ETA (Egyptian e-invoicing) technical spike, done before any Sales code. Signing strategy and ETA credentials are still open decisions; the submission engine is still deferred.
7. **`sales-module-research.md`** — Competitor research behind Sales' scope (Sales Returns / Sales Credit Notes added on top of the baseline).
8. **`sales-module-status.md`** — Step 4: Sales, backend + frontend, all 8 entities including Sales Credit Notes.
9. **`accounting-module-research.md`** — Competitor research, the terminology map (traditional Arabic bookkeeping terms vs. what's actually built), and the full 8-stage build roadmap for Accounting.
10. **`accounting-module-status.md`** — Step 5: Accounting, Stages 1–7 done, backend + frontend. **Includes the first-ever fully-green native verification run** (`pnpm typecheck`/`lint`/`build`/`test`, 294/294 tests) across the *whole* repo, not just Accounting — read this file's "Verification status" section for the five bugs found and fixed to get there, several of which were pre-existing issues in Sales/Purchases.
11. **`sales-pos-research.md`** *(added 2026-09-10 refresh)* — Point of Sale, an extension of the Sales module (cash sessions/shifts, discounts, checkout orchestration, X/Z reports). All 5 build stages are **code-complete but not yet committed** — see this file's own "Status" section and `next-steps-backlog.md` item 0.
12. **`settings-module-audit.md`** *(added 2026-09-10 refresh)* — a follow-up security/operational-maturity audit of Module 1 (rate limiting, 2FA, password reset, httpOnly cookies, and more). Everything in the audit's backlog is implemented, but **not yet natively verified or confirmed committed** — see `next-steps-backlog.md` item 1.
13. **`platform-flexibility-strategy.md`** *(added 2026-09-10 refresh)* — the Plan (commercial tiers) + tenant self-service feature-toggle design, and the "invoice-takeover orchestrator" pattern that lets a tenant skip optional documents in the Sales and Purchases cycles. Both layers and both orchestrators (Sales commit `6fcc1ce`, Purchases commit `41fe5af`) are built, verified, and committed as of this file.
14. **`next-steps-backlog.md`** *(added 2026-09-10 refresh)* — a handoff doc listing every open item across the whole project (not tied to one module), what state each is actually in, and what a new session should check first. Written specifically so a new chat doesn't have to re-derive this from the other 13 files. **Read this one first.**

## What's NOT in this folder

- **`docs/project-master-doc.md`** (in this same repo, one level up) — the actual master/architecture document these status docs all refer back to. Not duplicated here since it already lives in the repo as a real file.
- **`CLAUDE.md`** (repo root) — the working engineering-rules document referenced throughout these docs as "CLAUDE.md §X". Also already a real file in this repo.

## Current overall status (as of the 2026-09-10 refresh)

Settings, Users & Permissions, Inventory, Purchases, and Sales are all fully done (backend + frontend). Accounting is done through Stage 7 — only **Stage 8 (Tax Returns)** remains, and it needs its own research pass first. The Plan/self-service feature-flexibility layer (Layers 1+2) and the invoice-takeover orchestrator for both the Sales and Purchases cycles are also now built, verified, and committed.

Three things are open and not yet closed out — see `next-steps-backlog.md` for full detail on each:
- The POS feature (`sales-pos-research.md`) is code-complete across all 5 stages but was **deliberately never committed**, waiting on one native verification pass + one commit.
- The Settings hardening backlog (`settings-module-audit.md`) is implemented but **not yet confirmed run natively or committed** — `pnpm install`, migrations `0065`–`0068`, and `pnpm typecheck/lint/test` all still need a native run, plus two production-readiness decisions (email provider, cookie hosting-topology assumption).
- `GoodsReceiptsService.confirm()` is not yet Outbox-backed (an intentional, tracked asymmetry with Sales' `DeliveriesService.confirm()`), and `PlanFeatureGuard` coverage is inconsistent across a few controllers — both tracked, neither urgent.

## Environment note for whoever picks this up next

If continuing via a Claude session with a device-bridge/remote-shell connection to this machine rather than direct native access: that bridge (as of this export) still cannot run `pnpm`/`node@24`/`docker` directly, so `pnpm typecheck`/`lint`/`build`/`test` need to be run by you, natively, in your own terminal, with output pasted back for diagnosis. This has been the working pattern for the whole project and is documented in more detail in `settings-module-status.md`'s "Environment notes" section.
