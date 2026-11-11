# Settings hub — phase 1 delivered (2026-11-09, uncommitted)

The competitor survey and full plan are in the Claude Doc "مسح شامل للإعدادات — ERP": https://claude.ai/artifact/EKHKN8HJizFTNRYvGmuWfU

## User decisions (2026-11-09)
- Do phase 1 first, then phase 2.
- **Per-branch settings are deferred** together with branch permissions (users-permissions-review doc).
- **Anything specific to one kind of business is a switch in settings**, not something every tenant sees. Examples: marketplaces (Amazon, Jumia, Noon), POS, installments. Apply the same rule from now on.

## Phase 1 — what was built

### Activity switches
**Feature keys** added to `feature-catalog.ts`:
- `sales.channels`
- `sales.installments`
- `sales.reps`
- `cheques`
- `pos`
- `inventory.landed_costs`
- `fixed_assets`
- `budgets`

**How they behave**
- They are in `PLAN_EXEMPT_FEATURE_KEYS`: every plan includes them, and only the tenant's own switch decides (`PlanResolverService` adds them).
- `PlanFeatureGuard` now requires the class key AND the method key. For example, Fixed Assets needs both `accounting` and `fixed_assets`.

**Where they are guarded**
- Whole controllers: sales channels/settlements, received cheques, POS sessions/operations/drawer, landed costs.
- Single methods: installments endpoints, sales-reps endpoints, supplier `cheques` and `clear-cheque`, every fixed-assets and budgets method.
- A cheque as a payment method is refused through `shared/auth/assert-feature-on.ts`.

**Migration 0118** turns each switch off only when the tenant never used it, by checking the feature's data. Existing customers keep everything they use; a new tenant starts with a short menu.

**Web**
- Nav items carry `feature`.
- `components/feature/when-feature.tsx` hides:
  - the rep field on orders, invoices and customers;
  - the installments section;
  - the cheque payment option.
- The POS quick action follows `feature: 'pos'`.

**Settings › Modules & features page**
- Rebuilt with three groups: activity / document-chain steps / core.
- Each switch has an Arabic description and a new `Switch` component (libs/ui).
- The session refreshes right after a change, so the menu updates at once (`refreshSession` exported from api-client).

### Settings changes in the audit log
- `shared/audit/audit-changes.interceptor.ts`: `@AuditChanges(module, entityType)` on a controller emits `<module>.<entity>.<created|updated|deleted>` with the body as `changes`.
  - Secrets are masked; large values are dropped.
  - `@NoAudit()` skips a write, for example numbering `allocate-next`.
- Applied to:
  - every Settings controller: tenant settings, branches, currencies, custom fields, templates, feature toggles, numbering, taxes;
  - inventory settings;
  - accounting settings.
- `DomainAuditListener` also listens to `settings.**`.
- The audit-log page has a "Settings" module filter and Arabic entity names.

### Central settings store
- **Contracts:** `APP_SETTINGS` in `libs/contracts/src/settings/app-settings.contract.ts` is the single registry. Each entry has a key, kind (number/boolean/choice), limits, default and hub section. The API validates and the web renders from it.
- **Storage:** migration 0119 adds `app_settings` (key, value jsonb, updated_by). A missing row means the default, which is today's behaviour.
- **Reading:** `shared/app-settings` has a global `AppSettingsRepository.get(db, key)` that any module can use.
- **API:** `AppSettingsService` and `GET/PATCH /app-settings` (`settings.manage`).
  - It validates everything before writing anything.
  - `null` resets a setting to its default.
  - Each changed key is audited as `settings.app_setting.updated` with `from`/`to`.
- **First settings:** `security.lockoutMaxAttempts` (5) and `security.lockoutMinutes` (15). `LoginLockoutService` reads them, so they are no longer constants.

### Settings hub UI
- `/settings` is a searchable home of cards in four groups: Organization · Documents & printing · Modules · System. Search matches titles, hints, keywords and setting labels.
- `/settings/:section` shows the section beside a sidebar of all sections, which has its own search.
- Links out to Users, Roles, Inventory settings, Accounting settings and the Audit log.
- Old `?tab=` links redirect to the matching section.
- `AppSettingsSection` renders a registry section with:
  - the label, a hint, and the control (number with unit and range, switch, or choices);
  - "reset to default (x)";
  - a sticky save bar showing the number of unsaved changes;
  - Ctrl+S to save.
- The sales module got a sidebar gear pointing to `/settings/sales`. "سجل التدقيق" was renamed "سجل المراجعة" everywhere.

## Verification
- api + web tsc and eslint clean.
- Unit: 459 tests.
- Integration: 33 suites / 172 tests. New: `settings-hub.int-spec.ts` (store, validation, 0118 defaults) and the interceptor spec.
- The UI was checked with Playwright screenshots against mocked API responses (hub, security, modules).

## Next: phase 2 (from the doc)
Sales and POS settings through `APP_SETTINGS`:
- default walk-in customer;
- selling below cost or below the minimum price (allow / warn / block);
- maximum discount per role;
- return window in days;
- whether a sales rep is required;
- POS receipt contents and auto-print;
- cash rounding;
- default notes and terms shown on the document itself;
- fixed or editable document numbers;
- backdating limit.

Each setting needs:
1. a registry entry;
2. the code that reads it;
3. an Arabic label and hint;
4. a test.
