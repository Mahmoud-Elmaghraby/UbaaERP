# UI/UX redesign — plan & progress

User asked (2026-10-04) to redo the whole frontend look before any new backend work. On 2026-10-05 the user said to continue through the remaining phases autonomously.

## Audit findings (screenshots of apps/web run with mocked API)
- No unified design system; tables styled inconsistently. Settings tabs/branches table rendered LTR inside RTL. **Root cause: no Radix `DirectionProvider`, so every Radix primitive defaulted to dir="ltr".** Fixed.
- Two fonts (Cairo + IBM Plex), no type scale, non-tabular numbers.
- Text-only sidebar, no topbar/breadcrumbs/search, `/` redirected to `/settings`, no ErrorBoundary.
- **Functional gap found 2026-10-05:** the backend supports direct sales/purchase invoicing (customerId/supplierId + directLines, when Sales/Purchase Orders are disabled for the tenant), but the frontend only offered invoicing from an order — tenants with Orders turned off could not create invoices from the UI. Fixed in Phase 3.

## Backend bug found 2026-10-06 (fixed, verified by typecheck on user's machine)
- `apps/api/src/main.ts` registered `useGlobalFilters(new DomainExceptionFilter(), new UnexpectedExceptionFilter())`. Nest **reverses** the global filter list (`router-exception-filters.js: setCustomFilters(filters.reverse())`) and uses the first match, so the bare `@Catch()` UnexpectedExceptionFilter caught everything: every domain error (invalid login, not found, conflicts, business rules) reached the client as a generic 500 instead of 401/404/409/422 + its Arabic message. Seen in the API log as `[UnexpectedExceptionFilter] unhandled exception: AuthenticationError ... AUTH.INVALID_REFRESH_TOKEN`.
- Fix: order swapped to `(new UnexpectedExceptionFilter(), new DomainExceptionFilter())` with a corrected comment. E2E tests didn't catch it because `test/e2e/app.ts` registers only DomainExceptionFilter — worth aligning the e2e app with main.ts and adding one test asserting a 401/404 status end-to-end.

## Confirmed decisions
- Font: IBM Plex Sans Arabic only (400–700), tabular numbers in tables.
- Color: evolve teal #0E6B5C + neutral cool grays; whole brand palette derived at runtime from ONE accent (`apps/web/src/app/theme/palette.ts`). Per-user now (Appearance dialog); later a tenant-wide default from Settings.
- Density: comfortable (48px rows) default + compact (36px) per user.
- Status colors: draft → neutral, confirmed/posted/sent/submitted → info, partially_* → warning, fully_*/approved/accepted/selected/open → success, cancelled/rejected → danger.

## Phases
0. ✅ Design tokens, ThemeProvider (accent → tokens, dark mode, density), RTL DirectionProvider.
1. ✅ App shell: grouped icon sidebar (collapsible), topbar (breadcrumbs, Ctrl+K palette, user menu), RouteErrorPage + 404, Home page, AuthLayout.
2. ✅ libs/ui primitives restyled; DataTable in card with search/EmptyState/pagination; PageHeader + EmptyState; `useFeatureChecker()` added to features-context.
3. ✅ Document screens: shared `apps/web/src/components/document/` (DocumentHeaderBar, DocumentChain, DocumentBody, SectionCard, InfoGrid, TotalsPanel, PanelCard, DirectLinesEditor). Sales & Purchase invoices are full routed pages (`…/new`, `…/:id`): sticky action bar, document-chain stepper, worksheet with live line totals, totals panel, party card, attachments. Direct invoicing mode added. Money preview helpers in lib/money.ts (BigInt, no floats). Nav/search/home hide sub-sections whose Plan feature is off.
4. ✅ (partial) Home "يحتاج انتباهك" panel with real counts. Money KPIs still need dedicated read endpoints.
5. ✅ (first pass) All modules: semantic status badges, page descriptions, carded tables.

## Next candidates
- Convert other documents (sales orders, quotations, deliveries, purchase orders, goods receipts, journal entries) to the full-page document pattern.
- POS touch-first redesign.
- Dashboard money KPIs (needs backend read endpoints).
- Self-host IBM Plex (offline Electron build can't load Google Fonts).
- Tenant-wide brand color in Settings.
- Align e2e test app filters with main.ts (see backend bug above).

## Delivery state (2026-10-06)
- All three UI batches (71 + 33 + 91 files) and the main.ts fix are on `M:\Projects\erp-platform`, checksum-verified. User committed/pushed batches 1–2 and ran `git rm` on the 4 superseded invoice files; batch 3 + main.ts fix pending the user's commit. `pnpm typecheck` 9/9 green on the user's machine.
- The cloud session's own branch could not be pushed (repo not in the session's authorized sources); it's saved as `ui-redesign.bundle` in session outputs. Commits/pushes are done by the user.

## Mockup
https://claude.ai/artifact/MHMNin3CkdV6E6zZpiKNfc
