# START HERE: full project handoff (updated 2026-11-12)

Read this first in any new Claude session or account. The repo alone is enough to pick up the work. You do not need the old account's Claude Project.

**Reading order:**
1. This file.
2. `CLAUDE.md` (repo root). These are the engineering rules, and they bind.
3. `docs/claude-context/session-handoff-2026-11-12-hr.md`. **The newest work:** the whole HR & payroll module (11-11 → 11-12): migrations, endpoints, permissions, money flows, tests, gaps, lessons.
4. `docs/claude-context/project-docs/hr-module-plan-2026-11-11.md`. The HR design, the user's decisions, and per-step progress.
5. `docs/claude-context/session-handoff-2026-11-07.md`. What was built from 2026-11-07 to 11-11, section by section.
6. `docs/claude-context/project-docs/`. A full copy of the docs from the old account's Claude Project "ERPplatform" (Oct–Nov 2026).
7. The older history from Aug–Sep 2026 is in the other files in `docs/claude-context/`. See `README.md`.

---

## 1. Project in one paragraph
This is an Egyptian ERP product with a placeholder name ("ERP Platform" / "Ubaa"; the final name is still open).
- **Modules:** Settings, Users & Permissions, Inventory, Purchases, Sales (with POS), Accounting, Treasury, and **HR & Payroll** (since 0.3.0; a plan module, off by default).
- **Two targets, one codebase:**
  - Web: multi-tenant SaaS, schema-per-tenant. Not deployed yet.
  - Windows desktop: Electron, fully offline, with its own PostgreSQL. This is what customers use today.
- **Owner:** Mahmoud Elmaghraby (TEG). Claude acts as the "software company": it reviews, proposes and builds.

## 2. Repo and where the truth lives
- **Local source of truth:** `M:\Projects\erp-platform` on the user's Windows PC.
- **GitHub:** `Mahmoud-Elmaghraby/UbaaERP`, branch `master`.
- **Last pushed commit:** `53bf415` (feat(hr): step 7 — payslips, HR overview, desktop 0.3.0), plus the docs commit that added this update.
- **Tenant migrations:** they go up to **`0128_hr_payroll`** (0123–0128 = HR module). They are auto-discovered by filename in `apps/api/src/database/tenant/migrations/`.
- **Desktop version:** **0.3.0** (`apps/desktop/package.json`) — adds the HR module (off by default).
- **Cloud clones:** any copy in a Claude cloud sandbox has a different, unpushable history. **Never push from the cloud.** Deliver changes as files to the device repo; the user commits and pushes.

## 3. Standing rules from the user (always apply)
- **Language:** reply in **Egyptian Arabic**. Code, comments and commits are in English. All UI text goes through i18n keys (`apps/web/src/i18n/locales/ar.json`).
- **Act like a big software company:**
  - Work module by module: find problems, compare with competitors (Odoo, Daftra, Qoyod, Wafeq), add what's missing, improve UI/UX.
  - Review your own work and pick the best option.
- **Shared code:** reused code goes in central places. No duplication.
- **Generic features:** features are generic and data-driven. Anything specific to one kind of business (marketplaces, POS, installments, reps, cheques…) is an **on/off activity switch** in settings. There are no "clothing mode" hacks.
- **Discuss first:** big designs, new modules and new financial flows. Other work proceeds.
- **Commits and pushes:** only the user does these, on his PC. Claude prepares `.git/commit-files.txt` + `.git/msg-code.txt`, and the user runs:
  ```
  git add --pathspec-from-file=.git/commit-files.txt
  git commit -F .git/msg-code.txt
  git push
  ```
- **Destructive operations:** no deletes, resets or destructive DB operations without explicit approval. Delete permission is granted per session.
- **Tokens:** keep Claude credits and tokens low; lean outputs.
- **CLAUDE.md in full**, including:
  - Outbox for financial events.
  - Accounting is never called directly.
  - Money value object.
  - `<Can>`.
  - `PlanFeatureGuard` on optional modules.
  - Every new dependency must be justified.

## 4. Customers
| Customer | Status | Notes |
|---|---|---|
| **Clothing brand** (first live customer, urgent) | Has **v0.1.0** installed (2026-10-15) with their items. **v0.2.1 is ready to build and install.** | Buys from factories and companies. Sells in a shop, wholesale and retail, and online on Jumia / Amazon / Noon at different prices. **Every size/colour has its own factory code.** Uses **no taxes**. Docs: `project-docs/clothing-release-0.2.0-*.md`, `jumia-statement-format.md`, `sales-channels-settlements-2026-10-10.md`, `product-form-clothing-2026-10-09.md`. |
| **Distribution company** (food: chocolate and candy; important prospect) | **HR & payroll built (0.3.0, phase 1 complete)** — waiting for the user to test a full month and for the client's real fingerprint export. The rest of their plan is **not started**; discuss before building (next: the foundation — shops as warehouse+POS+treasury, lots/expiry/FEFO, carton/box/piece units, transfer pricing setting, data import). | Needs: HR and payroll (monthly, no taxes or insurance at first; fingerprint data by Excel import), inventory with lots/FEFO and units, purchases, accounting, wholesale/retail by price list, reps with commission (fixed or tiers, monthly targets; they take orders and sell from the van), shops as POS each with its own warehouse and supplied by transfer from the main warehouse at cost (a setting), a fleet (owned and depreciated, or rented; fuel from custody; routes), and live map tracking from Android phones. Not registered for ETA. Doc: `project-docs/new-client-distribution-plan-2026-11-10.md`. The full plan was a Claude Doc on the old account: https://claude.ai/artifact/9iZyHJSPXzeDBV1Y3PcC7c (may not open from another account). |
| **Marble/tile engraving workshop** | Discovery only. | Hypothesis: a light Job Orders module. Doc: `project-docs/engraving-customer-discovery-2026-10-16.md`. Question sheet: `docs/customers/engraving/`. |

## 5. Release history (desktop)
- **0.1.0** (2026-10-15): first install at the clothing customer. Field fixes:
  - Electron 44 (`ERR_REQUIRE_ESM` with kysely 0.29);
  - a silent install of the VC++ runtime;
  - an Arabic installer with its details list;
  - `repair.cmd`.
- **0.2.0** (commit `55e1704`), for the clothing customer:
  - price lists with a signed ± % and category rules (0122), plus price list ⇄ Excel;
  - POS exchange (`POST /pos/sessions/:id/exchange`);
  - sales analysis by product / category / size-colour / cashier / channel, with platform fees;
  - a size × colour grid on documents ("إضافة موديل بالمقاسات");
  - an upgrade rehearsal test from 0101 to 0122.
- **0.2.1** (commit `d132aaa`):
  - a factory code per variant in the product form, and Excel import with one row per variant;
  - label fixes: the name wraps to 2 lines; "print the item code as the barcode"; a warning for codes too long for the label; Code 128 set C;
  - **the scanner works on the Arabic keyboard layout** (`apps/web/src/lib/keyboard-layout.ts`, used by `resolveScan`);
  - **a crash fix.** The tenant pg Pool had no `'error'` listener, so a dropped idle connection (sleep/wake) killed the API. The app reloaded, and quit after 5 crashes. Also: `unhandledRejection` is logged, the window reloads on a renderer crash, and events go to `logs/desktop.log`.
- **0.3.0** (2026-11-12): the **HR & payroll module** (steps 1–7 of `project-docs/hr-module-plan-2026-11-11.md`): employees and org structure, salaries, shifts/holidays/attendance import, leaves, loans and bonuses/penalties, the monthly payroll run (post + pay), payslip printing and the HR overview. Migrations 0123–0128; the `hr` module starts **off** for every tenant (Settings › Modules), so the clothing customer sees no change. The upgrade rehearsal now checks the HR defaults too.
- **To install at the customer:** run the new installer over the old one. It takes a pre-update `pg_dump` automatically. Then:
  - Turn on any activity they need in **الإعدادات › الموديولات**. Migration 0118 turned off switches they never used, such as POS. HR (0123) starts off too.
  - On the labels page, tick "اطبع كود الصنف كباركود" if they label with factory codes.

## 6. Building the Windows installer (user's PC)
```
cd /d M:\Projects\erp-platform
apps\desktop\build-installer.bat
```
- **Output:** `apps\desktop\release\ERP Platform-Setup-<version>.exe`. NSIS is slow; that is normal.
- **If Electron or NSIS downloads hang** (GitHub is slow on the user's network), set these first in PowerShell:
  ```
  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
  ```
- **Version:** bump `apps/desktop/package.json` for every release.
- **Customer logs:** `C:\ProgramData\ERP Platform\logs\`, which holds `setup.log`, `api.log`, `postgres.log` and `desktop.log`. They also open from the tray icon. `repair.cmd` in the install folder (run as admin) re-runs setup and migrations, with the output on screen.
- **Pre-delivery checklist:** `project-docs/nabgha-installer-lessons-2026-10-15.md`.

## 7. Dev environment (user's PC)
```
cd M:\Projects\erp-platform
docker compose up -d
pnpm install; pnpm build
cd apps\api; pnpm db:migrate; pnpm start:dev
# second terminal
cd M:\Projects\erp-platform\apps\web; pnpm dev -- --port 8080   # 5173 is in a Windows reserved range
```
- **Dev tenant:** `demo`.
- **Owner seed:** `pnpm --filter api run db:seed-owner -- demo <email> "<password>" "<name>"`.

## 8. How Claude worked in the cloud sandbox (repeat this setup in a new session)
- **Cloud repo:** at `/home/claude/erp`. Copy the device repo across with a tar (exclude node_modules, .git, `apps/desktop/{.cache,staging,release}`), then run `pnpm install --ignore-scripts`. Prisma can't generate there, so the Prisma tsc errors and 2 failing unit suites are expected.
- **Build the libs:**
  ```
  pnpm --filter @erp-platform/contracts build
  pnpm --filter @erp-platform/shared-kernel build
  pnpm --filter @erp-platform/ui build
  ```
- **Unit tests:**
  ```
  cd apps/api && npx jest --config jest.config.js --selectProjects unit
  ```
  Expect 514 passing (as of `53bf415`), plus 2 Prisma suites that fail.
- **Integration tests (real Postgres 16):**
  1. Start Postgres:
     ```
     su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pg/data -o '-p 5433 -k /var/tmp/pg' -l /var/tmp/pg/log -w start"
     ```
  2. Run the suites:
     ```
     DATABASE_URL=postgres://postgres@localhost:5433/postgres npx jest -c .devcheck/jest.int.config.js
     ```
  Expect 39 suites / 193 tests (as of `53bf415`). `apps/api/.devcheck/` is git-ignored and sandbox-only: a jest config that provisions a schema from the tenant migrations and stubs Prisma. **A copy is kept in `docs/claude-context/sandbox-devcheck/`** — copy its three files to `apps/api/.devcheck/` in a new sandbox. Postgres first needs `initdb`: `mkdir -p /var/tmp/pg && chown postgres /var/tmp/pg && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pg/data -A trust"`. The sandbox server stops between turns sometimes — start it again if a run says ECONNREFUSED 5433.
- **e2e tests:** they need Prisma, so run them on the user's PC.
- **Sending changes to the device:**
  1. Tar the changed files to `/mnt/user-data/outputs`.
  2. `device_commit_files` the tar to `M:\Projects\erp-platform\.claude-tmp\`.
  3. Extract on the device with `tar --overwrite -xzf`.
  4. Check every file's md5 against the cloud copy, ignoring CR.
  5. Add the files to `.git/commit-files.txt`.
  6. Write `.git/commit-files.txt` and `.git/msg-code.txt` with `device_bash` (`cp` from `.claude-tmp/`) — `device_commit_files` refuses paths inside `.git/`.
  7. Delete `.claude-tmp`, which needs delete permission; otherwise ask the user to.
- **CRLF noise:** hundreds of files in the device working tree show as changed only because of CRLF line endings. Commit only through `commit-files.txt`. The suggested fix is `git config core.autocrlf true`.
- **CRLF files:** some sources on the device are CRLF (e.g. `entity-errors.ts`, `numbering-defaults.ts`, contracts). Edit them keeping CRLF (Python `open(p, newline='')`), or the diff becomes the whole file.
- **i18n:** merge Arabic strings with a small JSON fragment merge into `ar.json`. Never hand-edit large parts of it.
- **Libs on the PC:** after changing `libs/`, tell the user to run `pnpm --filter @erp-platform/contracts build` (and shared-kernel / ui if touched) before `pnpm start:dev`.
- **The device VM** can't run pnpm/tsc: Windows junctions can't be read there. Typecheck, lint and tests run in the cloud; the installer build runs on the user's PC.

## 9. Key architecture pieces added recently (use them; don't duplicate)
- **Central settings store:**
  - `APP_SETTINGS` in `libs/contracts/src/settings/app-settings.contract.ts`, with kinds number (nullable/decimals), boolean, choice and text, plus the `feature` and `group` fields.
  - API: `AppSettingsRepository.get/getMany`. PATCH resets a key with `{reset:true}`.
  - Web: `useAppSetting().get(key)`. The hub UI renders from the registry.
- **Activity switches:** feature keys in `feature-catalog.ts` (`PLAN_EXEMPT_FEATURE_KEYS`). `PlanFeatureGuard` checks the class key AND the method key. Web: `<WhenFeature>`.
- **Limits:**
  - `SalesLimitsService` (discount, below cost / minimum price, rep required, return window).
  - `PurchaseLimitsService` (approval amount, price above last price, over-receipt tolerance, supplier invoice number required).
  - `@CheckDocumentDates()`.
  - `…/limits-check` endpoints, with web callouts.
- **Pricing:** `apps/web/src/components/product/sale-pricing.ts` is the only price resolver. Order: variant item → product item → category rule → list ± % → normal price.
- **Scanning:** `resolveScan` in `components/product/variant-search.ts` (barcode → pack barcode → SKU/code → scale barcode, with an Arabic-layout retry).
- **Other shared pieces:**
  - Printing: `shared/printing`, one provider per document.
  - Treasury movements: `TreasuryMovementRegistry`.
  - Statements: `shared/statements`.
  - Stock check: `StockAvailabilityChecker`.
  - Outbox decorator: `OnOutboxEvent` with `requiresFeature`.
  - Nested transactions: `withTransaction`. Kysely can't nest them.
  - Audit trail: `DomainAuditListener` (sales, purchases, inventory, accounting, settings, **hr**); `@AuditChanges(module, entity)` on configuration-style controllers.
  - Printing gate: `PrintProvider.feature` — a plan module's documents can't be printed without the module.
- **HR (see `session-handoff-2026-11-12-hr.md`):** pure domain in `modules/hr/domain/` (minutes-not-timezones attendance, punch parsing, leave days, loan schedules, `computePayroll`); `shift-rules.ts` loaders shared by attendance/leaves/payroll; `AccountingHrPostingListener` for loan and payroll entries; treasury sources `HrLoanMovements` / `HrPayrollMovements`.

## 10. Open items / backlog (priority order)
0. **HR & payroll — test before selling:** the user runs a full month on his PC (employees, salaries, a real fingerprint export, a leave, a loan, payroll run, post, pay, payslip) and reports issues. Screens were never exercised in a browser by Claude. Known gaps: `session-handoff-2026-11-12-hr.md` §11.
1. **Clothing customer:**
   - Build and install **0.3.0** (includes every 0.2.x fix; HR stays off), then confirm whether the crashes stop. If they don't, get `api.log` / `desktop.log`.
   - Waiting from the customer: the Jumia **Orders** export, for the daily import.
2. **Distribution client:** HR module **built (0.3.0)** — see `project-docs/hr-module-plan-2026-11-11.md` (decisions, progress, known gaps). Next per the client plan: the foundation (shop restrictions, lots/FEFO…), then sales/reps/commissions.
3. **Settings hub, phase 4:**
   - Fixed or editable document numbers.
   - Inventory settings moved into the hub, plus the negative-stock policy.
   - Dropping the old `tenant_settings` columns (needs approval).
4. **Deferred by the user:** enforcing branch access; "own records only" (options are in `users-permissions-review`).
5. **Gaps:**
   - Promotions ("buy 2 get 1"), loyalty, gift cards.
   - ETA e-invoice signing and submission (only credentials exist).
   - Desktop auto-update and code signing, plus an off-machine backup.
   - A real email provider.
   - The platform admin panel (plan in `platform-admin-plan.md`).
   - A restore rehearsal on the customer's backup.
6. **Decisions still open:** the product's final name and icon (not "أصول": it collides with OSOL); allowing bank overdraft; hosting (deferred).

## 11. Index of `project-docs/` (copied from the old Claude Project)
| File | What it covers |
|---|---|
| erp-platform-handoff.md | 2026-10-16 handoff: first customer live, installer lessons, competitor assessment, waiting items |
| status-review-2026-11-07.md | Commits from 10-16 to 11-07 (accounting close, sales credit/reps/installments/cheques, POS returns, purchases integrity) |
| ui-redesign-plan.md | Design system, app shell, document pages |
| go-live-readiness.md | Go-live blockers and their status |
| target-customers-inventory-needs.md | Five target customer types and what they need from inventory |
| inventory-audit-2026-10.md | Inventory hardening: integrity, lots, units, cost accuracy, counts |
| inventory-step4-2026-10-08.md | Transfers, granular permissions, images, Excel import, GL postings |
| inventory-review-2026-11-07.md | Inventory screens as pages, labels, movement analysis |
| taxes-and-payments-2026-10-08.md | Tax engine, receipts to the GL, supplier payments |
| printing-2026-10-08.md | Central print service |
| statements-and-treasury-2026-10-09.md | Statements without Accounting, the Treasury module |
| debit-notes-treasury-guard-taxes-2026-10-09.md | Debit notes, no-negative cash, hiding unused taxes |
| product-form-clothing-2026-10-09.md | Inline options form, per-variant prices |
| settings-review-2026-10-09.md | Currencies, numbering, module settings |
| sales-channels-settlements-2026-10-10.md | Marketplace channels and settlements |
| jumia-statement-format.md | The real Jumia statement CSV format and its mapping |
| stock-policy-and-pos-treasuries-2026-10-14.md | Never-negative stock with quick add; POS tenders by treasury |
| desktop-installer-2026-10-08.md | Installer design and decisions |
| nabgha-installer-lessons-2026-10-15.md | Lessons from the older Nabgha project, plus the pre-delivery checklist |
| platform-admin-plan.md | SaaS admin panel design (not built) |
| price-lists-2026-10-28.md | Price lists, part 1 |
| purchases-frontend-review-2026-11-07.md | Purchases pages, analysis, price history, supplier price lists, cloud tooling |
| users-permissions-review-2026-11-07.md | Owner protection, audit trail, granular permissions, lockout, deferred items |
| settings-hub-2026-11-09.md / -phase2- / -phase3-purchases- | Settings hub phases 1–3 |
| clothing-release-0.2.0-2026-11-10.md / -additions-2026-11-11.md | Releases 0.2.0 and 0.2.1 |
| new-client-distribution-plan-2026-11-10.md | Distribution client plan |
| hr-module-plan-2026-11-11.md | HR & payroll: design, competitor baseline, user decisions, per-step progress (steps 1–7), known gaps |
| engraving-customer-discovery-2026-10-16.md | Engraving prospect |

**Claude Docs on the old account** (they may not open from a new account; ask the user to export them if needed):
- Settings survey and plan: https://claude.ai/artifact/EKHKN8HJizFTNRYvGmuWfU
- Distribution client plan: https://claude.ai/artifact/9iZyHJSPXzeDBV1Y3PcC7c
- UI mockup: https://claude.ai/artifact/MHMNin3CkdV6E6zZpiKNfc
