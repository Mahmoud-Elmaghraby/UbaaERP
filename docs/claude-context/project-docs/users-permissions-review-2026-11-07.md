# Users & Permissions review — phases 1–2 and phase 3.1 delivered (2026-11-07/08, uncommitted)

## Competitor comparison
Done after the user asked whether the standard competitor check had been done. Sources: Daftra branches docs, Wafeq user roles help, Qoyod knowledge base, an Odoo login-monitor add-on.

**Gaps compared with competitors**
- **Default roles:** Wafeq ships five default roles (Owner, Manager, Accountant, Viewer, Employee). We seed only Owner.
- **Permission granularity:**
  - Qoyod separates create / approve-post / edit-delete.
  - Ours: Inventory is granular (`inventory.*`), but Sales and Purchases are one key each (`sales.manage` + `pos.supervise` + `sales.override_credit_limit`; `purchases.manage`). A cashier therefore gets everything in sales: delete, cancel, reports.
- **Branch scoping:**
  - Daftra links users to branches, ties treasuries and warehouses to branches, and hides other branches' transactions. Qoyod has per-site invoice visibility.
  - Ours: `user_branch_access` is stored but **enforced nowhere**.
- **"Own records only":** Qoyod has it, and it is requested on Xero. We don't have it.
- **Login history, brute-force lockout, force logout:** Odoo add-on. We had force logout in the API only, no UI; lockout is per-IP throttling only.
- **Our advantage:** TOTP 2FA with backup codes.

## Phase 1 — security and user pages

**Owner protection** (`UsersService.assertMayManage`)
- Only an Owner may act on an Owner account or grant the Owner role. Before this, anyone with `users.manage` could make themselves Owner or reset an Owner's password.
- At least one active Owner must remain: `USER.LAST_OWNER`.

**System role locked**
- The Owner role's permissions and name can't be changed: `ROLE.SYSTEM_LOCKED`. Stripping them used to lock the tenant out.

**New endpoints**
- `POST /users/:id/set-password`: an admin sets a password. This is the only recovery path on the desktop build, which has no e-mail. It revokes sessions; own account not allowed (`USER.USE_CHANGE_PASSWORD`).
- `POST /users/:id/reset-2fa`: an admin turns 2FA off for someone who lost their phone.

**DTO changes**
- `UserDto` gains `twoFactorEnabled` and `lastLoginAt`. The last login is read from audit_logs `auth.login`; no new column.
- `RoleDto` gains `userCount`.
- `GET /roles` is readable with `users.manage` too (for the role picker).

**Web: users**
- `/users` list: status tabs, search, role, last login, 2FA icon.
- `/users/new` and `/:id/edit`: password field with show/hide and a "generate" button.
- `/users/:id` page:
  - info (role links to the role page, 2FA, last login);
  - branch access and direct-manager sections (from the old dialog, now `user-access-sections.tsx`);
  - recent activity;
  - actions: set password, sign out everywhere, reset 2FA, send invite, deactivate/activate.

**Web: roles**
- `/roles` list: user count, permission count.
- `/roles/new` and `/roles/:id`:
  - permission matrix (`permission-matrix.tsx`);
  - **role templates** (`role-templates.ts`): cashier, branch supervisor, storekeeper, purchasing, accountant, viewer, general manager;
  - copy a role (`?from=`);
  - members list;
  - delete (blocked while users hold the role);
  - Owner shown read-only.

## Phase 2 — a real audit trail

**`DomainAuditListener`** replaces `InventoryAuditListener`.
- Listens to `sales.**`, `purchases.**`, `inventory.**` and `accounting.**`, covering plain and Outbox-dispatched events alike.
- Stores entity_type + entity_id + the plain action, which is what the document history panels read. Before this, documents outside inventory had no history at all.
- Metadata is trimmed: arrays become `xCount`, big values are dropped.
- Never throws, so it can't make an Outbox event retry. It skips a duplicate when the Outbox redelivers (same entity, action and `occurredAt`).

**Audit API**
- `entityType=a,b,c` filters a whole module.
- A bare `to` date covers the whole day.

**Migration `0116_audit_log_user_index`**
- Index on `(user_id, action, created_at)`.

**Web: audit log** (`/audit-logs`)
- Filters in the URL: module, user, action, from/to.
- 50 rows a page; Excel export.
- Arabic event and document labels.
- Each record links to its page; rows expand to show details.

**Shared**
- `components/audit/audit-format.ts`: labels, module→entity map.
- `lib/entity-routes.ts`: one entity→page map; the journal-entry and statement link maps now use it.

**Verification**
- web tsc + eslint clean; api tsc clean apart from Prisma.
- Unit tests: 453 pass (the 2 Prisma-only suites still fail as before).
- Integration: 31 suites / 167 tests, including the new `users-audit.int-spec.ts`.

## Phase 3.1 — granular Sales and Purchases permissions (delivered 2026-11-08)

**Migration `0117_trade_permissions`**, the same pattern as 0082.
- `sales.manage` was replaced by:
  - `sales.view`
  - `sales.create` (drafts, customers)
  - `sales.post` (confirm, post, allocate, cheques, refunds, opening balance)
  - `sales.cancel` (cancel and delete)
  - `sales.reports.view`
  - `sales.settings.manage` (price lists, channels, reps, ETA credentials)
  - `pos.use` (all POS and drawer endpoints)
- `purchases.manage` was replaced by `purchases.view`, `.create`, `.post`, `.cancel`, `.reports.view` and `.settings.manage` (supplier price lists).
- Existing roles keep exactly what they had: holders of the old key get every new key of the module (`sales.manage` also brings `pos.use`), Owner gets all, and the old keys are removed.

**API**
- `shared/auth/trade-permissions.ts` holds the constants (`S` / `PU`).
- The 30 Sales and Purchases controllers moved from a class-level key to per-endpoint keys:
  - GET → view;
  - POST/PATCH → create;
  - post/confirm/allocate/approve → post;
  - cancel/DELETE → cancel;
  - share-link → view.
- Lookups a cashier needs at the POS also accept `pos.use`: customers, sales reps, price lists, catalogue, stock, tax rules, treasuries.
- Print providers need view; sales invoice and sales return receipts also accept `pos.use`.
- Attachments need create.
- Purchase prices are visible with `purchases.view`.

**Web**
- `lib/permissions.ts` gains `SALES`, `PURCH`, `SALES_WRITE`, `PURCH_WRITE`, `ANY_SALES_PERMISSION` and `ANY_PURCHASES_PERMISSION`.
- Sidebar: each child item has its own key; reports and settings items use their own keys; the POS item uses `pos.use`.
- The 15 document pages gate every action button separately: delete/cancel → cancel, post/confirm → post, edit/create-next → create, WhatsApp share → view.
- List "new" buttons need create.
- Role templates were updated: the cashier is now only `pos.use` + item read; a salesperson template was added.
- Arabic permission labels were added.

**Verification**
- api + web tsc and eslint clean.
- Unit tests: 453.
- Integration: 31 suites / 168 tests, including the 0117 checks in `users-audit.int-spec.ts`.

**Still coarse inside a page:** list-row dropdowns in `purchase-invoices-tab` use `PURCH_WRITE`. The API enforces the exact key anyway.

## Phase 3.4 — per-account lockout (delivered 2026-11-08)

**Rule**
- 5 wrong passwords within 15 minutes, counted since the last sign-in, password reset/set or unlock, lock the account for 15 minutes after the last of them.
- `LoginLockoutService` reads this from audit_logs. No new column; the lookup uses `audit_logs_entity_idx`.
- Attempts while locked are logged with reason `locked` and don't extend the lock.
- The attempt that hits the limit is answered `AUTH.ACCOUNT_LOCKED` (with minutes) and audited as `auth.account_locked`.

**Admin**
- `POST /users/:id/unlock` writes `user.unlocked`, which resets the count. Setting a password also resets it.
- `GET /users/:id` returns `lockedUntil`.
- The user page shows a "locked until" badge and an unlock action.

**Tests**
- Unit: `login-lockout.service.spec.ts`.
- Integration: added to `users-audit.int-spec.ts`.

## Deferred by the user (2026-11-08)
The user chose to postpone both remaining items. Notes for when they come back:

- **Enforce branch access.**
  - Today only warehouses (and requisitions) carry a branch. Sales/purchase invoices and orders have none; treasuries have no branch column.
  - Options:
    - (a) Warehouses + treasuries only: add `treasuries.branch_id`, filter pickers, validate on POS, receipts, payments and stock documents. Documents without a warehouse stay visible to all.
    - (b) Also add a branch to every sales/purchase document and filter lists.
  - Open decision: does a user with no branch rows see all branches (backward compatible) or none?
- **Own records only.**
  - Option (a): through `sales_reps.user_id`, which already exists. A user sees only customers, quotations, orders and invoices where they are the rep, and a cashier only their own sessions. No migration, Sales only.
  - Option (b): add `created_by_user_id` to every sales/purchase document. Covers Purchases too; old documents would have no owner.
