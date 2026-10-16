# Session handoff — 2026-10-16 (read this first in a new chat)

Supersedes `session-handoff-2026-10-04.md`. The live, detailed docs are in the Claude Project **"ERPplatform"** (`claude/*.md`). This file is the entry point that ties them together.

## 1. Where things stand

- **The first real customer is live:** a clothing brand that sells in a shop and on Jumia, Amazon and Noon. It runs the **Windows desktop build v0.1.0**, which installed and runs fine on the customer's PC (2026-10-15/16).
- **Git:** `M:\Projects\erp-platform` is the source of truth. Last commit is `a5cb4cf` (desktop: Electron 44, VC++ runtime, Arabic installer with details, repair.cmd), on `master`, GitHub `Mahmoud-Elmaghraby/UbaaERP`.
- **Old cloud clone:** any Claude cloud sandbox clone (`/home/claude/erp`) has a different, unpushable history. Never push from it. Deliver changes as files to the device repo; the user commits and pushes.
- **Tenant migrations:** go up to `0101_variant_prices`.

## 2. Working rules (from the user, standing)

- **Language:** reply in Egyptian Arabic.
- **Act like a software company:**
  - Review your own work.
  - Pick the best option.
  - Put anything reused in a central service; no duplicated code.
- **Big designs:** discuss them before building.
- **Credits:** keep Claude credits and tokens low; lean outputs.
- **Generic code:** build customer-specific needs (clothing) as generic, settings- or data-driven features. No "clothing mode", and don't break other activities.
- **CLAUDE.md applies in full:**
  - Outbox for financial events; Accounting is never called directly.
  - Money VO, i18n keys, `<Can>`.
  - New modules and new financial flows need approval.
  - No deletes, resets or destructive DB operations without approval.
  - Justify any new dependency.
- **Commits and pushes:** only when asked, and done by the user on his machine.

## 3. What was built 2026-10-08 → 10-16 (details in the Project docs)

| Area | Summary | Project doc |
|---|---|---|
| Taxes and payments | VAT, table tax and WHT on invoices and credit notes; supplier payments; receipts post to the GL | `taxes-and-payments-2026-10-08.md` |
| Printing | Print registry and providers for every document; A4 and thermal | `printing-2026-10-08.md` |
| Inventory | Stocktake, opening stock, Excel import, item card, valuation, low stock | `inventory-audit-2026-10.md`, `inventory-step4-2026-10-08.md` |
| Statements and treasury | Customer and supplier statements, treasuries, treasury movement registry | `statements-and-treasury-2026-10-09.md` |
| Debit notes, treasury guard, taxes | Purchase debit notes; cash and wallet treasuries can't go negative (`assertCanWithdraw`) | `debit-notes-treasury-guard-taxes-2026-10-09.md` |
| Product form for clothing | Options editor (size, colour, anything); combinations become variants; price per variant; SKU optional; unit optional (defaults to "قطعة") | `product-form-clothing-2026-10-09.md` |
| Settings review | Currencies tab, full numbering list, a settings gear per module, more printables | `settings-review-2026-10-09.md` |
| Sales channels and marketplace settlements | The platform is a customer. A settlement posts a receipt (orders − refunds) and the fees as `marketplace_fees`. Outbox `sales.channel_settlement.posted` then Accounting | `sales-channels-settlements-2026-10-10.md`, `jumia-statement-format.md` |
| Stock policy and POS treasuries | Stock never negative. A shortage carries `data.shortages`, and a central QuickStockDialog lets an authorised user add stock (a posted adjustment). POS tenders carry `treasuryId`. In-app ConfirmDialog replaces `window.confirm` | `stock-policy-and-pos-treasuries-2026-10-14.md` |
| Desktop installer | See section 4 | `desktop-installer-2026-10-08.md`, `nabgha-installer-lessons-2026-10-15.md` |

## 4. Desktop installer: how to build, and what we learned

**Build** (PowerShell, in `M:\Projects\erp-platform`):

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm install            # only when dependencies changed (the .bat uses --frozen-lockfile)
apps\desktop\build-installer.bat
```

- The output is `apps\desktop\release\ERP Platform-Setup-0.1.0.exe`. The NSIS step is slow (several minutes or more); that is normal.
- GitHub downloads hang on the user's network, hence the mirrors.

**Fixed on the first customer install:**

1. **`ERR_REQUIRE_ESM`:** kysely 0.29 is ESM-only, and Electron 32's Node 20.18 can't `require()` it.
   - Electron was bumped to **44.7.2**.
   - The `stage.mjs` smoke test now runs on **Electron's own Node** (`ELECTRON_RUN_AS_NODE=1`). Before, it ran on the build PC's Node 22, which hid the bug.
2. **VC++ runtime:** the bare PostgreSQL binaries need VCRUNTIME140, which a clean Windows doesn't have.
   - `vc_redist.x64.exe` is staged and installed silently, only when it is missing.
3. **The installer now shows its details list** (a `customHeader` with `ShowInstDetails show`) and is **always in Arabic**.
4. **`repair.cmd`** is written into the install folder before the DB step.
   - Run it as admin. It re-runs `setup.js install` (idempotent: backup, start the DB, pending migrations) with the output on screen. This was Nabgha's only reliable field diagnosis.
   - **Logs** are in `C:\ProgramData\ERP Platform\logs\` (`setup.log`, `api.log`, `postgres.log`).

**Nabgha** (`M:\Projects\Nabgha\docs\INSTALLER_DEEP_DIVE_v2.md`) was studied in full. Each of its problems is mapped to our status in `nabgha-installer-lessons-2026-10-15.md`, which also has the pre-delivery checklist.

## 5. Running the dev environment (user's PC)

```powershell
cd M:\Projects\erp-platform
docker compose up -d
pnpm install; pnpm build          # after pulling new code
cd apps\api; pnpm db:migrate; pnpm start:dev
# second terminal:
cd M:\Projects\erp-platform\apps\web; pnpm dev -- --port 8080   # 5173 is in a Windows reserved range
```

The dev tenant is `demo`. Seed an owner with `pnpm --filter api run db:seed-owner -- demo <email> "<password>" "<name>"`.

## 6. Honest assessment vs competitors (Daftra, Odoo, Qoyod) — 2026-10-16

**Strong / ahead:**
- Fully offline desktop with its own Postgres.
- Marketplace (Jumia) settlement import with fees.
- Price per size or colour.
- Stock that can never go negative, with an inline quick fix.
- Treasury per payment method.
- Automatic accounting (outbox), statements, taxes, stocktake, POS shifts.

**Not yet proven:**
- Weeks of real use.
- Automated end-to-end tests of the financial flows.
- Auto-update and code signing.
- Off-machine backup copies.
- A production web/SaaS deployment (hosting, real email, tenant admin screen).

**Gaps for a clothing shop, in priority order** (verified absent in code):

1. 🔴 **Barcode label/sticker printing** (name, price, size).
2. 🔴 **Sales reports:** by item, category, size, colour, cashier and period.
3. 🔴 **Best-selling / slow-moving / item profitability.**
4. 🟠 **Promotions and discounts:** % per category, buy X get Y, season clearance.
5. 🟠 **Price lists:** wholesale vs retail, per customer.
6. 🟠 **Per-channel profitability** (Jumia, Amazon, Noon, shop) and a daily Jumia orders import. The Jumia orders import needs the customer's Orders export file.
7. 🟡 **ETA e-invoice:** signing and submission. Only credential storage exists.
8. 🟡 **Loyalty points and gift cards.**
9. 🟡 **Customer credit limit, and instalments with reminders.**
10. ⚪ **New modules, each needing a separate decision:** e-commerce, HR/payroll, fixed assets, mobile app.

**Recommended next step:** start with item 1 (barcode labels), then items 2–3 (reports).

## 7. Waiting on the user / customer

- **Version and name:** keep 0.1.0 or make it 1.0.0? Final product name and icon ("ERP Platform" is a placeholder; "أصول" collides with OSOL).
- **From the customer:** the Jumia **Orders export** file, and the product list / opening stock (if not entered yet).
- **Bank treasury overdraft:** allow it or not? Banks are currently exempt from the no-negative guard.
- **Admin panel:** where the platform admin panel lives. A plan exists in `platform-admin-plan.md`, not built.
- **Support DB access policy** for desktop installs.

## 8. Other offered, not started

- An Excel product list prepared from the customer's 51 Jumia SKUs.
- Auto-creating invoices from the statement's Seller SKUs.
- Expense bills on credit (the marketing company).
- A channel tag on expenses.
