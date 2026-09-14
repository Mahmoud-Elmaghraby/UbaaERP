# Step 3 — Inventory Module Frontend: Feature-Complete, Redesign Proposal Pending Approval

**Last updated:** 2026-08-28. Task #20 (final verification) is done — `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm build` ✅, `pnpm test` ✅ (all four green across the whole monorepo, confirmed by the user running them natively on Windows). **The Inventory module frontend (`apps/web`) is functionally complete and verified.** One real bug was found while running the app end-to-end (see "Bug found while running the app" below, fully documented in `claude/inventory-module-status.md`). The user then asked to pause before starting Purchases and rethink the frontend's visual design and navigation structure — see "Visual/structural redesign — proposal pending approval" below, which is the actual current next step, superseding the earlier "next: Purchases" note.

## Standing instructions that drove this work

1. User (verbatim): *"تمام تقدر تبدأ في الفرونت احترافي متكامل من غير ولا غلطه واهم حاجه يكون ريسبونسيف وعصري وبعدين نختبر كله مره واحده"* — build the full Inventory frontend: professional, fully integrated, no mistakes, **responsiveness as the single most important attribute**, modern look, with **all testing/verification deferred to one consolidated pass at the very end**. Task #20 delivered on this.
2. User (verbatim, newer): keep working, but prioritize documenting/updating this doc if context/quota looks low. Honored throughout via incremental updates to this doc after every fix.
3. User (verbatim, newest — this update): *"محتاج اتناقش معاك اي افضل استركشر للفرونت عشان الاستركشر الي موجود ده مش عاجبني خالص لا الشكل ولا الاستركشر"* — wants to discuss and likely rework the frontend's visual look AND structure (navigation organization + file/folder structure) before moving on to Purchases. When asked for reference apps/direction, explicitly said *"سيب الموضوع ليك، اقترح إنت"* — full creative discretion given, not yet a green light to implement in the real codebase.

Standing constraints honored throughout and unaffected by the redesign discussion (these are settled tech decisions, not up for debate): React + shadcn/ui + Tailwind, TanStack Table for data-heavy tables, Zustand for local state, React Query for server state, Arabic-first + RTL, i18n-ready, shared `<Can>` component for permission-gated UI, custom fields via the dynamic form engine, `PlanFeatureGuard` deliberately deferred (backend-only), one task at a time, no unrelated refactors, never commit without being asked.

## Bug found while running the app for the first time (fixed)

After Task #20 passed, the user ran the app end-to-end and the Inventory link was missing from the sidebar. Root cause: a migration-ordering bug meant the `inventory.manage` permission (added in migration `0021`) was never actually granted to the Owner role in `role_permissions`, on any tenant. Fixed with a new migration `apps/api/src/database/tenant/migrations/0028_grant_missing_permissions_to_owner.ts`. **Full diagnosis and fix details are in `claude/inventory-module-status.md`** (the more appropriate doc for a backend/migration bug) — this entry here is a pointer, not a duplicate.

**Status: fix applied, `pnpm db:migrate` run by the user, but not yet explicitly re-confirmed that Inventory now shows in the sidebar** after logging out and back in — the user's last message before this redesign discussion was about the login screen's tenant field being empty (a separate, unrelated UX hiccup: `test_tenant` needed to be typed into the tenant identifier field, since what was showing there was only placeholder text, not a real value). The conversation moved on to the redesign discussion before an explicit "it works now" confirmation came back. **Follow up with the user to confirm Inventory does show in the sidebar now**, next time this comes up — don't assume it's resolved just because the conversation moved on.

## Visual/structural redesign — proposal pending approval

The user is not happy with either the current visual design or the navigation/file structure and asked for a full rethink, giving full creative discretion (no specific reference apps requested — explicitly said to just propose something).

**What was produced (discussion only, nothing implemented in the real codebase yet)**: a mockup published via the Artifact tool at `https://claude.ai/code/artifact/7517367b-343c-448d-83ce-055e3b74c2d4` (title "هيكلة أصول الجديدة"), showing a full redesign direction using the Inventory → Products screen as the concrete example. The user was told explicitly that this is a discussion artifact only — publishing it changed nothing in `apps/web`.

**Proposed direction** (pitched to the user, awaiting their reaction/approval before any real implementation):

1. **Visual design system**: drop the current dark-navy-sidebar + gold-accent "institutional" look entirely. New direction: a single deep teal/emerald accent color (`#0e6b5c` light / `#35c9a8` dark) on a light, airy neutral background with a cool grey-green tint (not pure white/pure grey — deliberately chosen, not default), replacing the heavy dark sidebar block with a light, subtly-tinted sidebar panel separated by a hairline border (closer to modern SaaS shells like Linear/Vercel/Notion than the old "admin template" feel). Typography: `IBM Plex Sans Arabic` for headings/display (more character than the current all-Cairo setup), `Cairo` kept for body/UI text (continuity + it's a solid Arabic UI face already in use). Semantic colors (success/warning/danger/info) kept strictly separate from the brand accent. Both light and dark theme tokens defined (`prefers-color-scheme` + `data-theme` override pattern), even though the app doesn't have a theme toggle yet — sets up cleanly for one later.
2. **Navigation/IA restructure (the more consequential change)**: replace the current pattern — one sidebar link per module, with all of that module's sub-sections crammed into in-page `Tabs` (e.g. today's Inventory page: 5 tabs in one `inventory-page.tsx` shell, which is why `stock-tab.tsx` alone is 836 lines) — with a two-level sidebar: top-level module entries, each expandable to reveal its sub-sections as their own real routed pages (e.g. `/inventory/products`, `/inventory/warehouses`, `/inventory/stock`, `/inventory/units-of-measure`, `/inventory/landed-costs`), each with its own breadcrumb, page header, and primary action button. Scales cleanly to Purchases/Sales/Accounting later (the mockup shows them as disabled "قريبًا" sidebar entries to demonstrate this). **This is the change most worth getting explicit sign-off on** — it affects every future module's routing and file layout, not just Inventory's.
3. **File/folder structure**: break up the current flat `features/<module>/*.tsx` files (several 400-800+ line "tab" files mixing a table, multiple forms, and local hooks in one file) into a per-entity subfolder convention, e.g. `features/inventory/products/{products-page,products-table,product-form}.tsx` instead of one `products-tab.tsx`. No technology change — same React/shadcn/TanStack Table/Zustand/React Query stack, purely a code-organization convention going forward.

**Nothing here overrides a settled [مستقر] decision** from the master doc — this is layout, visual theme, and file organization, not the tech stack itself, which stays exactly as specified in CLAUDE.md.

**Next action**: waiting on the user's reaction to the mockup (keep it as-is, adjust colors/layout, or reject the direction) before touching any real file in `apps/web`. Once approved, the plan is to apply the new IA + visual system + file structure to Inventory first (already built, so this becomes a restructuring pass, not new-feature work), then carry the same conventions into Purchases from the start rather than doing Purchases in the old pattern and restructuring it too later.

## Critical environment note (for any future session continuing this repo)

This session reaches the repo (`M:\Projects\erp-platform`) only through the Cowork device bridge (`device_bash` → a Linux VM with the repo mounted). **`tsc`/`eslint`/`jest`/`pnpm build` cannot be run from this session** — the repo's `node_modules` uses Windows NTFS junctions, broken over the Linux VM bridge. All verification for this module was done by the user running commands natively on Windows and pasting results back for this session to fix in a tight loop. This pattern should be reused for any future module.

## Task list — final state (Tasks #12–20, pre-redesign)

| # | Task | Status |
|---|---|---|
| 12 | DataTable + money helpers + responsive shell | completed |
| 13 | Inventory `queries.ts` (all API hooks) | completed |
| 14 | Units of Measure tab | completed |
| 15 | Warehouses tab | completed |
| 16 | Products tab | completed |
| 17 | Stock tab (levels/movements/transfers/lots) | completed |
| 18 | Landed Costs tab | completed |
| 19 | Arabic i18n strings for Inventory (completeness pass) | completed |
| 20 | Final verification (typecheck/lint/build/test) | **completed** — all four commands pass cleanly |

## Task #20 — verification results (final)

- **`pnpm typecheck`**: `Tasks: 9 successful, 9 total`.
- **`pnpm lint`**: clean, zero output.
- **`pnpm build`**: `Tasks: 6 successful, 6 total`. `apps/web` built in 35.42s. One non-blocking Vite advisory (not an error): the main JS chunk is 788.55 kB (224.32 kB gzip), above Vite's default 500 kB warning threshold, suggesting route-level code-splitting (`dynamic import()`) or `manualChunks`. Left as a future optimization note — will likely resolve naturally if the route-per-page redesign above happens (route-level code-splitting becomes natural once each sub-section is its own route).
- **`pnpm test`**: `Tasks: 9 successful, 9 total`. `apps/api`: 34/34 suites, 294/294 tests (unit+integration+e2e together, against a real local Postgres). `apps/web`: no-op placeholder (no frontend tests written yet).

### Fixes applied during Task #20 (for reference / future modules)

1. **Implicit-`any` on `row` in `ColumnDef` callbacks**: TS's contextual typing through `ColumnDef<T>[]`'s union type doesn't reliably propagate into every column's `accessorFn`/`cell` callback. **Always type explicitly**: `accessorFn: (row: TData) => ...`, `cell: ({ row }: { row: Row<TData> }) => ...` (import `Row` from `@tanstack/react-table`).
2. **`@tanstack/react-table` must be a direct dependency of any package importing its types**, not just of `libs/ui` — pnpm's strict isolation blocks transitive resolution. Added to `apps/web/package.json`.
3. **Plain interfaces aren't assignable to `Record<string, V>` params** without an explicit index signature. Use plain `object` as the parameter type instead when passing a typed filters interface to a generic query-string builder.
4. **`.eslintrc.cjs` in this repo only registers `@typescript-eslint` + `boundaries`** — `eslint-plugin-react-hooks` was never configured. Never add `// eslint-disable-next-line react-hooks/*` comments; ESLint errors on a disable-comment referencing an unregistered rule.
5. **`apps/api`'s integration/e2e tests need a live local Postgres** — from the repo's root `docker-compose.yml` (`postgres:16-alpine` on host port `5434` by default, plus `minio` on `9000`/`9001`). Must be started manually with `docker compose up -d` before `pnpm test`.

## What's built (full module summary — current structure, pre-redesign)

### Shared infrastructure (Task #12–13)
- **`libs/ui/src/components/ui/data-table.tsx`** — generic `<DataTable>` on `@tanstack/react-table` (client-side sort + pagination), loading skeletons, empty state, RTL-aware pagination. Consumers: `ProductsTab`, `StockLevelsView`, `StockMovementsView`, `LandedCostsTab`.
- **`apps/web/src/lib/money.ts`** — `decimalToMinorUnits`/`minorUnitsToDecimalString`, BigInt-only, matches backend `Money.toDecimalString()`.
- **`apps/web/src/app/layout/app-shell.tsx`** — mobile-responsive: custom drawer sidebar, backdrop, mobile top header, body-scroll lock. **This file is the main target of the navigation redesign above.**
- Router (`router.tsx`) + nav (`nav-items.ts`): `/inventory` route, gated on `inventory.manage`.
- **`apps/web/src/features/inventory/queries.ts`** (~320+ lines) — every React Query hook for the module.
- **`apps/web/src/features/inventory/inventory-page.tsx`** — 5-tab shell, horizontal-scroll `TabsList` for mobile. **This tabs-in-one-page pattern is what the redesign proposes replacing with real routes.**

### Units of Measure tab — `units-of-measure-tab.tsx`, ~527 lines
List + create/edit dialogs + a standalone `UnitConverter` tool. `BaseUnitField` enforces the backend's one-level-deep conversion rule client-side too.

### Warehouses tab — `warehouses-tab.tsx` (449 lines) + `warehouse-locations-dialog.tsx` (326 lines)
List + create/edit + per-row dropdown. `BranchField` uses a `__none__` sentinel. Custom fields (`entityType='warehouse'`). `WarehouseLocationsDialog` is a nested full-CRUD dialog.

### Products tab — `products-tab.tsx` (591 lines) + `product-variants-dialog.tsx` (226 lines)
`ProductsTab`: first `<DataTable>` consumer. `CreateProductForm`/`EditProductForm`: `unitOfMeasureId`, `trackingType`, `trackVariants` (conditional `attributes`), `defaultVariantSku` (create-only), custom fields. `ProductVariantsDialog`/`AddVariantForm`: list + create only.

### Stock tab — `stock-tab.tsx`, 836 lines
`StockTab`: filter bar, gated action buttons, nested `Tabs` (levels/movements/lots), two `Dialog`s. `ProductVariantSelector`/`WarehouseLocationSelector`: reused cascading selects. `useVariantIndex()`/`useLocationLookups()`: memoized ID→name `Map`s. `StockLevelsView`: `DataTable` + `ReorderPointForm`. `StockMovementsView`: `DataTable`. `StockLotsView`: plain `Table`. `RecordMovementForm`/`TransferStockForm`: plain `useState` per field; backend Zod schema is the real validation source. Currency from `useTenantSettings().currencyCode ?? 'EGP'`.

### Landed Costs tab — `landed-costs-tab.tsx`, 463 lines
`LandedCostsTab`: `DataTable` list + gated "Apply" button + two dialogs. `LandedCostAllocationsView`: read-only detail table. `ApplyLandedCostForm`: plain `useState` per field; client-side eligibility filter mirrors `LandedCostsService.fetchEligibleMovement` exactly. Currency from `useTenantSettings().currencyCode ?? 'EGP'`.

## Patterns established (reusable for future modules — still valid regardless of redesign outcome)

- **Separate Create/Edit form components**, each with its own `useForm<CreateXDto>`/`useForm<UpdateXDto>` + matching `zodResolver`.
- **Nullable-FK `<Select>`**: sentinel string constant (`__none__`) mapped to/from `null`.
- **Dynamic custom fields**: `staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) })` (create) / `.partial()` (edit), `zodResolver(formSchema as z.ZodType<CreateXDto>)`. Only render `<CustomFieldsFormSection>` when `definitions.length > 0`.
- **Nested sub-resource dialogs**: `<Dialog open={parent !== null} onOpenChange={(open) => !open && onClose()}>`.
- **A list/create-only sub-resource** should stay list/create-only in the UI if that's all the backend controller exposes.
- **`DataTable` columns**: always type the `row` parameter explicitly — `accessorFn: (row: TData) => ...`, `cell: ({ row }: { row: Row<TData> }) => ...` (import `Row` from `@tanstack/react-table`).
- **Plain-controlled-state forms**: when a form's shape is dynamic (cascading selects, conditional fields) use plain `useState` per field, validate required fields manually, let the backend be the real validation source.
- **Composed bulk-lookup hooks via `useQueries`**: fan out an existing per-item endpoint, reusing its exact query key.
- **New packages importing `@tanstack/react-table` types must declare it as their own direct dependency**, even if a workspace lib already depends on it.
- **`.eslintrc.cjs` in this repo only registers `@typescript-eslint` + `boundaries`** — never add a disable-comment for a rule from an unconfigured plugin (e.g. `react-hooks/*`).
- **Local Postgres/MinIO for `apps/api` integration+e2e tests**: `docker compose up -d` from the repo root before `pnpm test`.
- **Each new module's permission-seed migration should explicitly grant its permission to Owner in the same migration** (see "Bug found while running the app" above) — don't rely on `0009`'s one-time grant or `0028`'s one-off backfill covering it after the fact.

## i18n keys added (`apps/web/src/i18n/locales/ar.json`)

`nav.inventory`, `nav.openMenu`; `inventory.title`, `inventory.tabs.*` (5); `inventory.unitsOfMeasure.*` (19); `inventory.warehouses.*` (23); `inventory.products.*` (27); `inventory.stock.*` (54); `inventory.landedCosts.*` (17); `common.yes`, `common.no`, `common.status`. Cross-verified programmatically (all `t('...')` calls resolve to a real key; no hardcoded UI text).

## Known cleanup items (non-blocking)

- **`libs/ui/src/components/ui/data-table.tsx.b64`** — a stray temp file left in the repo from the first push attempt. Wrong extension, not imported anywhere, zero functional impact. The user needs to delete it manually.
- **Not yet visually verified in a real browser from this session**: the mobile drawer sidebar and horizontal-scroll tab bars. This will likely be superseded by the redesign's navigation changes anyway.

## Next step

**Waiting on the user's decision on the redesign proposal** (see "Visual/structural redesign" above) before doing anything else — not Purchases yet, and not further Inventory polish, since a restructure would touch the same files a Purchases build would otherwise copy the pattern from. Also still need to confirm with the user whether the `inventory.manage` permission fix (migration `0028`) actually resolved the missing sidebar link, since that was never explicitly confirmed before the conversation moved to the redesign discussion.
