# Session handoff — 2026-11-07 (read this first in a new chat)

Supersedes `session-handoff-2026-10-16.md`, which still holds the deployment and installer notes. The detailed per-feature docs live in the Claude Project **"ERPplatform"**:

- `claude/status-review-2026-11-07.md`
- `claude/purchases-frontend-review-2026-11-07.md`
- `claude/inventory-review-2026-11-07.md`

## 1. Where things stand

- **Method:** module by module. For each module: problems → missing features → UI/UX.
  - Done before this session: Accounting, Sales, POS and the Purchases backend.
  - Done in this session: the **Purchases frontend** (phases 1–3) and **Inventory** (passes 1–2).
- **Tenant migrations:** go up to `0115_purchase_price_lists`.
- **Verification at the end of this session:**
  - web `tsc` and API `tsc` are clean (in the cloud the API showed Prisma-client errors only; Prisma engines can't be downloaded there).
  - eslint is clean on the touched code.
  - API unit tests: 446 pass.
  - Integration tests: 30 suites / 165 tests pass.
- **Old cloud clone:** never push from a Claude cloud clone. Changes are delivered as files to `M:\Projects\erp-platform`, and the user commits and pushes.

## 2. Purchases — what was built

**Every document is a full page** (list → `/new` → `/:id` → `/:id/edit`), built from `components/document/document-layout`:

- Purchase orders:
  - manual, or from an RFQ quotation;
  - supplier price list and a last-purchase-price hint;
  - the document chain, receive / invoice actions, a WhatsApp share link.
- Goods receipts:
  - create a return from the receipt;
  - "print barcode" opens the labels page with copies = pieces received.
- Purchase returns, with their debit note.
- Debit notes: a list and a page.
- Supplier payments: editor and page. The allocation table is shared with sales receipts (`components/document/open-invoices-allocation.tsx`).
- Suppliers: list, editor (with a default price list), and a page with balance, aging, open invoices and recent orders.
- Requisitions, and RFQs (with a quotation comparison table → create a PO).
- Purchase analysis report (`/purchases/reports/analysis`) and price history.

**API**

- `GET purchase-debit-notes`, `GET purchase-debit-notes/:id`.
- `GET purchase-reports/analysis`, `GET purchase-reports/price-history`.
- `POST purchase-orders/:id/share-link`.

**Price lists**

- `price_lists.kind` is `'sale' | 'purchase'`, with the unique key `(kind, lower(name))`.
- `suppliers.price_list_id` (migration 0115).
- Endpoints: `/price-lists` (sales.manage) and `/purchase-price-lists` (purchases.manage).
- The web screens are reused with `kind="purchase"`.

## 3. Inventory — what was built

- **Products as pages:**
  - list with status tabs, search and a category filter that includes sub-categories;
  - editor page;
  - item page: variants with stock, stock by warehouse with value, prices, images, attachments, history, print labels.
- **API:** `GET /stock/levels?productId=`.
- **Barcode labels:**
  - layout: name, then options bold, then barcode and price;
  - prefilled through router state `LabelsPrefillState`.
- **Movement analysis** (`/inventory/movement-analysis`, `GET inventory-reports/movement-analysis`):
  - views: best sellers, slow movers, all;
  - days of cover;
  - Excel export.
- **Warehouses:**
  - list and editor;
  - warehouse page: locations inline with quantity per location, the top 10 items, a stock summary, and links to the filtered stock page.
- **Units of measure:**
  - list with base / derived tabs, grouped by family;
  - editor page with the derived units;
  - the converter card.
- **Stock page:**
  - the view (levels / movements / lots) and the filters live in the URL (`?view=movements&warehouse=…`);
  - a stock value column;
  - the manual movement is a page: `/inventory/stock/movements/new`.
- **Landed costs:**
  - list;
  - apply page, with select-all and a source-document column;
  - detail page showing capitalised vs expensed.

## 4. Shared code introduced (use these; don't duplicate)

- `components/party/party-picker.tsx`: `CustomerPicker` and `SupplierPicker` are thin wrappers over it.
- `components/product/use-variant-index.ts`: variant id → name, SKU, tracking type and `productId`.
- `components/document/whatsapp-share.tsx` and `components/document/open-invoices-allocation.tsx`.
- `components/report/report-format.ts`.
- `lib/use-save-shortcut.ts`.
- `apps/api/src/shared/reporting/fixed-point.ts`.
- `useLocationLookups`, in `inventory/api/warehouses/queries.ts`.

## 5. Next candidates

- **Inventory:**
  - sales analysis by size / colour / category;
  - reorder suggestions (reorder point + selling pace);
  - prefill landed costs from a goods receipt.
- Or move on to the next module review (Settings / Users & Permissions UI pass).

## 6. Users & Permissions (added 2026-11-09)

Full notes: Claude Project doc `claude/users-permissions-review-2026-11-07.md`, which includes the competitor comparison with Daftra, Wafeq, Qoyod and Odoo.

- **Tenant migrations:** now go up to `0117_trade_permissions`.
  - `0116`: audit-log user index.
  - `0117`: splits `sales.manage` / `purchases.manage` into granular keys.

**Security**
- Owner accounts:
  - Only an Owner may manage Owner accounts or grant the Owner role.
  - The last active Owner can't be demoted or deactivated.
  - The Owner role's permissions and name are locked.
- Admin actions:
  - Set someone's password (`POST /users/:id/set-password`), which signs them out everywhere.
  - Reset 2FA (`POST /users/:id/reset-2fa`).
  - Unlock (`POST /users/:id/unlock`).
- Per-account lockout: 5 wrong passwords in 15 minutes lock the account for 15 minutes. It is read from the audit log, so there is no new column.

**Pages**
- Users: list, editor, and a user page with role, branches, manager, 2FA, last login, recent activity and actions.
- Roles: list, editor with the permission matrix, role templates (cashier, salesperson, storekeeper…), copy role, members.

**Audit trail**
- `DomainAuditListener` records every `sales.* / purchases.* / inventory.* / accounting.*` event once (Outbox redelivery is de-duplicated). Document history panels now work in every module.
- The audit-log screen was rebuilt: filters in the URL, Arabic labels, links to records, details, paging, Excel export.

**Granular permissions**
- Sales keys: `sales.view / create / post / cancel / reports.view / settings.manage` + `pos.use`.
- Purchases keys: the same set except `pos.use`.
- Existing roles keep the same access through the migration.
- API constants live in `shared/auth/trade-permissions.ts`; the web uses `SALES` / `PURCH` in `lib/permissions.ts`.

**Shared**
- `lib/entity-routes.ts`: one record→page map.
- `components/audit/audit-format.ts`.

**Deferred by the user:** enforcing branch access, and "own records only". The options are written down in the project doc.

**Next:** review the Settings module the same way (code check + competitor comparison + phased plan).

## 7. Settings hub, phase 1 (added 2026-11-09)

Full notes:
- Claude Project doc `claude/settings-hub-2026-11-09.md`.
- The Claude Doc "مسح شامل للإعدادات — ERP" holds the competitor survey and the four-phase plan.

**Migrations:** tenant migrations now go up to `0119_app_settings`.
- `0118`: default switches for activity options.
- `0119`: the central settings store.

**Activity switches**
- New keys:
  - `sales.channels`
  - `sales.installments`
  - `sales.reps`
  - `cheques`
  - `pos`
  - `inventory.landed_costs`
  - `fixed_assets`
  - `budgets`
- They are in `PLAN_EXEMPT_FEATURE_KEYS`, so the tenant's own switch decides, never the plan.
- 0118 turns each off only for a tenant that never used it.
- `PlanFeatureGuard` requires the class key and the method key.
- The web hides the menu items and the fields inside documents (`WhenFeature`).

**User rule (2026-11-09)**
- Anything specific to one kind of business (marketplaces, POS, installments…) becomes a switch in settings.
- Per-branch settings are deferred together with branch permissions.

**Audit:** `@AuditChanges(module, entity)` (`shared/audit`) logs every write on Settings, inventory-settings and accounting-settings controllers.

**Central store**
- `APP_SETTINGS` (libs/contracts) is the one registry.
- `app_settings` table; global `AppSettingsRepository.get()`.
- `GET/PATCH /app-settings`, audited per key with from/to.
- First settings: the lockout attempts and minutes.

**Hub UI**
- `/settings` is a searchable card home in 4 groups; `/settings/:section` shows a section with a sidebar.
- `AppSettingsSection` renders registry settings, with a save bar and reset to default.
- Modules & features page: grouped switches with descriptions.

**Next:** phase 2, the sales and POS settings through `APP_SETTINGS`.

## 8. Settings hub, phase 2: sales, POS and document dates (added 2026-11-10)

Full notes: Claude Project doc `claude/settings-hub-phase2-2026-11-09.md`.

Tenant migrations go up to `0120_sales_settings`:
- copies `credit_limit_mode` and `pos_max_discount_percent` into `app_settings` (the old columns are left in place, unread);
- adds `products.min_sale_price_*`;
- adds the permissions `sales.override_limits` and `documents.backdate`.

**Registry (`APP_SETTINGS`)**
- New: nullable / decimal numbers, text, `feature`, `group`.
- Each section says who may change it (`APP_SETTING_SECTION_PERMISSIONS`).
- `GET /app-settings` is open to any signed-in user; PATCH resets a key with `{reset:true}`.

**Sales limits**
- `SalesLimitsService` checks:
  - the maximum discount;
  - selling below cost or below the minimum price (allow / warn / block);
  - the required rep.
- Checked on order confirm, and on direct-invoice post.
- `GET …/limits-check` on orders and invoices feeds the warning shown before confirming.
- The return window is checked in `SalesReturnsService.create`.

**Document dates**
- The `@CheckDocumentDates()` guard (`shared/app-settings/document-date.ts`) is on every create endpoint with a document date.

**POS**
- The discount limit comes from the store.
- Cash rounding goes on the sale's discount, always rounded down.
- Auto-print and the cashier's name on the receipt.

**Web**
- `lib/app-settings.ts` (`useAppSetting`).
- Sales / POS / Document-dates hub sections.
- `SalesLimitsCallout` on the order and invoice pages.
- New sales documents are prefilled from the settings.
- The product form has a minimum sale price.

