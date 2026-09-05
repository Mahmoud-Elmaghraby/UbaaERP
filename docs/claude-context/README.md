# Claude Context Docs

**Purpose:** this folder is a local, in-repo mirror of the working docs Claude (via the "ERP system" Claude Project) keeps about this codebase's build history, decisions, and status — settings/permissions, inventory, purchases, sales, and accounting. It exists so that starting a fresh Claude session (on this account or a different one) with just this repo attached is enough to pick up full context, without needing access to the Claude Project itself (which is tied to one account/organization and doesn't transfer automatically to a different account).

**Source of truth:** the Claude Project ("ERP system") is still the live, actively-updated copy — any future session working from that Project will keep writing there. This folder is a point-in-time export, generated 2026-08-31. If you're continuing work from the Project directly, these files may drift slightly behind it over time; ask whichever session is working to re-export this folder after a significant milestone if you want it kept current.

**How to use this with a new Claude session:** attach/open this repo, then point the session at this folder (`docs/claude-context/`) and ask it to read these files before starting — that gives it the same grounding the Project docs give a session with Project access.

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

## What's NOT in this folder

- **`docs/project-master-doc.md`** (in this same repo, one level up) — the actual master/architecture document these status docs all refer back to. Not duplicated here since it already lives in the repo as a real file.
- **`CLAUDE.md`** (repo root) — the working engineering-rules document referenced throughout these docs as "CLAUDE.md §X". Also already a real file in this repo.

## Current overall status (as of the 2026-08-31 export)

Settings, Users & Permissions, Inventory, Purchases, and Sales are all fully done (backend + frontend). Accounting is done through Stage 7 (Chart of Accounts, Fiscal Years/Periods, Journal Entries, Reports, Sales/Purchases auto-posting, Cost Centers, Bank Accounts, COGS auto-posting, Sales Credit Note auto-posting) — only **Stage 8 (Tax Returns)** remains, and it needs its own research pass first. Native verification (`typecheck`/`lint`/`build`/`test`) is confirmed green across the whole monorepo. A manual UI/browser pass (exercising the new Cost Centers/Bank Accounts screens, and checking a suspected `reversalDate` validation bug in `journal-entry-reverse-form.tsx`) is still outstanding — see `accounting-module-status.md`'s "Still not verified" note.

## Environment note for whoever picks this up next

If continuing via a Claude session with a device-bridge/remote-shell connection to this machine rather than direct native access: that bridge (as of this export) still cannot run `pnpm`/`node@24`/`docker` directly, so `pnpm typecheck`/`lint`/`build`/`test` need to be run by you, natively, in your own terminal, with output pasted back for diagnosis. This has been the working pattern for the whole project and is documented in more detail in `settings-module-status.md`'s "Environment notes" section.
</content>
