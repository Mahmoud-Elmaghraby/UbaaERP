# CLAUDE.md — ERP Platform (erp-platform)

This file is the operating manual for Claude Code (and any other Claude session) working in this
repository. It is derived from, and subordinate to, the project's master document:

> **Source of truth:** `docs/project-master-doc.md` ("الوثيقة الرئيسية لمشروع الـ ERP — النسخة النهائية")

If anything in this file ever appears to conflict with the master document, the master document
wins — stop and flag the conflict rather than resolving it silently. If the master document itself
is ambiguous or silent on a point, **stop and ask** rather than inventing a decision.

Decisions below are tagged the same way the master document tags them:

- **[مستقر]** — Final. Never override, weaken, or silently reinterpret without explicit user approval.
- **[مقترح]** — Proposed direction, not yet fully built. Follow it, but it may still be revised.
- **[مؤجل عمدًا]** — Deliberately deferred, not a blocker for current work. Do not invent an answer for it.
- **[مفتوح]** — Genuinely undecided. Do not decide it yourself.

---

## 1. What this project is

An integrated ERP (Sales, Purchases, Settings, Users & Permissions, Inventory, Accounting), highly
customizable, built on lessons learned from a prior production system ("نبغة"), while deliberately
avoiding the weaknesses that showed up there (see §12, "نبغة lessons").

**Two deployment targets, one codebase:**
- **Web** — multi-tenant SaaS.
- **Desktop** — Electron, fully offline, standalone (no server dependency).

---

## 2. Non-negotiable architecture ([مستقر])

### 2.1 Clean Architecture + selective DDD

```
domain/ → application/ → infrastructure/ → presentation/
```

- Dependencies point inward only (Dependency Inversion). Outer layers depend on inner layers, never
  the reverse.
- Business rules never live in controllers, repositories, or UI components.
- **DDD is applied selectively, not uniformly:**
  - Strong aggregates with strict invariants: **financial-sensitive modules only** — Sales,
    Purchases, Accounting.
  - Simple modules (Settings, lookup tables): plain CRUD. Do not impose full DDD ceremony where it
    adds no value — that's over-engineering the master document explicitly warns against.

### 2.2 Backend stack

- **NestJS + TypeScript.**
- **PostgreSQL everywhere** — including the fully offline desktop build. This avoids maintaining two
  separate storage layers for two different databases.
- **ORM split:**
  - **Prisma** for the `public` schema (platform data: plans, tenants, platform users).
  - **Kysely** for all tenant schemas (Prisma is not designed for dynamic runtime schema names).
- Do not use Prisma against a tenant schema, and do not use Kysely against `public`, without an
  explicit, discussed reason.

### 2.3 Multi-tenancy: schema-per-tenant

- **One full PostgreSQL schema per tenant.** Isolation happens at the database-connection level.
- **Never introduce a shared table keyed by `tenant_id`** as a substitute for schema-per-tenant,
  unless explicitly approved by the user — this is a deliberate, final decision, not a default that
  can be relaxed for convenience.
- The `public` schema (via Prisma) owns platform-level data only: plans, tenants, platform users.
- **Desktop has no multi-tenancy concept at all** — each installed instance is exactly one fixed
  tenant. Do not add tenant-switching logic to the desktop build.
- **Connection pooling watch-point [مستقر كملاحظة مستقبلية]:** schema-per-tenant with a large number
  of schemas risks connection-pool exhaustion. When concurrent active tenants approach **~50–100**,
  PgBouncer (transaction pooling mode) must be introduced. From day one, expose a simple metric for
  active DB connection count in monitoring so this threshold can be tracked as it's approached. Do
  not wait until pool exhaustion actually happens to start measuring it.

### 2.4 Electron desktop architecture

- Desktop app is Electron, **fully standalone**, with no dependency on a remote server.
- The NestJS backend runs **as a child process spawned by Electron** — this specifically avoids the
  ESM/CommonJS conflict that caused a real production incident in نبغة (the WhatsApp integration
  issue). Do not restructure this into an in-process/embedded backend without discussion.
- Desktop environment **[مستقر للـ MVP]:** no Docker at all. PostgreSQL is installed as a Windows
  Service via an NSIS installer, completely separate from the web deployment path.
- Desktop OS scope beyond Windows (macOS/Linux) is **[مؤجل عمدًا]** — packaging work, decided near the
  actual desktop-build phase. Do not assume or plan for non-Windows desktop support.

### 2.5 Shared kernel

- **Money Value Object is mandatory** for every monetary value in business logic. Never represent
  money as a raw floating-point number — this is a direct, named cause of rounding errors the
  project is explicitly designed to avoid.
- Shared domain concepts belong in the shared kernel (`libs/shared-kernel`) only when they are
  genuinely cross-module — don't promote module-local concepts into the shared kernel by default.

### 2.6 Module decoupling: Event Bus

- Cross-module communication happens **only** through the Event Bus (`EventEmitter2`), never via
  direct import to trigger business behavior in another module.
- **Accounting listens to events. It is never called directly** by Sales or Purchases (or any other
  module). This is a hard rule, not a style preference.
- If a module is not enabled for a given tenant, its events simply have no listener — this must work
  without special-casing "module not enabled" logic at the event-emission site.

### 2.7 Outbox Pattern for financial events [مستقر]

- `EventEmitter2` alone is in-memory only: a crash between a financial operation committing and
  Accounting receiving the event would silently lose that event.
- **Any financially sensitive event** (e.g. `sale.invoice_confirmed`, `purchase.invoice_posted`, and
  equivalents) must be written to an `event_outbox` table **inside the same database transaction**
  as the business operation — not after it commits.
- A simple polling worker (short interval) reads unprocessed outbox rows, executes them, and marks
  them done. On failure, the row remains and is retried.
- **No Redis or extra infrastructure for this** — the outbox table lives in the same Postgres
  instance/schema already in use. Do not introduce a message queue to solve this.
- Do not rely on `EventEmitter2` alone for any event that touches money or that Accounting must never
  miss.

### 2.8 Feature gating: PlanFeatureGuard [مستقر]

- **Every endpoint belonging to an optional module must enforce `PlanFeatureGuard`**, from day one.
- This exists specifically to avoid a real نبغة vulnerability: a `features` column existed in the
  data model but was never actually enforced at the API layer.
- **Never rely on frontend feature-hiding as a substitute for backend enforcement.** Hiding a menu
  item is a UX nicety, not authorization.

### 2.9 Shared contracts (Zod) [مقترح — not yet implemented]

- Target: a shared `libs/contracts` package of Zod schemas, imported verbatim by both backend
  (validation) and frontend (`zodResolver` form validation), so both sides validate against the same
  source of truth.
- This is a proposed direction the team has agreed on, but implementation has not started. Treat it
  as the plan to build toward, not as existing infrastructure — verify what actually exists in
  `libs/contracts` before assuming a schema is already there.

---

## 3. Tenant migrations & provisioning [مستقر]

- **Tenant Migration Runner:** iterates the tenant list stored in `public.tenants`, applies Kysely
  migration files in order to each tenant schema, and tracks applied migrations in a
  `schema_migrations` table inside each schema.
- **Tenant Provisioning:** on new-tenant signup, run **all** migrations from scratch against a
  freshly created empty schema. There is no separate "template schema" — provisioning and migration
  share the same code path by design.
- **Partial-failure handling:** if a migration fails for one tenant partway through a batch run over
  many tenants, the runner **continues** processing the remaining tenants — it must not abort the
  whole run. Failures are recorded in a `migration_failures` table (`tenant_id`, `migration_file`,
  `error`, `timestamp`) and trigger an alert (email/Slack webhook).
- A separate `retry-failed-migrations` command re-attempts only the tenants recorded as failed.
- **Never manually modify a tenant's schema as a substitute for writing a migration.** Never modify a
  production schema by hand.

---

## 4. Supporting services [مستقر]

- **Redis:** not needed from day one. Add it only when a real need appears (background jobs, heavy
  reporting) — do not add it speculatively.
- **MinIO:** needed earlier than Redis — required starting from the **Inventory** module (item
  images), the third module in the build order.

---

## 5. CI / pipeline

- **CI [مستقر]:** `lint` + `typecheck` + `test` must run on every PR. Treat all three as required,
  not optional.
- **CD [مؤجل عمدًا]:** tied to the still-undecided production hosting model (VPS vs. managed service).
  Not a blocker for module development, which depends only on local `docker-compose`. Do not design
  or assume a CD pipeline; do not pick a hosting provider on your own.

---

## 6. Environments

- **Local dev [مستقر]:** `docker-compose.yml` runs PostgreSQL + MinIO. Redis is added later, only
  when needed (§4).
- **Production/web hosting [مؤجل عمدًا، غير عائق]:** VPS vs. managed DB service is undecided by
  design — deliberately, since it has no bearing on local module development. This affects three
  things only: CD (§5), the production Dockerfile, and the web backup strategy (§8) — all decided
  near actual deployment, not before. Do not pre-empt this decision.
- **Desktop [مستقر للـ MVP]:** no Docker; PostgreSQL as a Windows Service via NSIS installer. See
  §2.4.

---

## 7. Custom fields & the dynamic form engine [مستقر]

- Every major entity supports a flexible `custom_fields` column.
- This is only meaningful in combination with the **dynamic form engine**: a general frontend
  component that reads an entity's `custom_fields` schema from the backend and renders the
  appropriate input (text/number/date/list) automatically. Implementing custom fields on the backend
  without wiring them through the dynamic form engine is an incomplete implementation of this
  decision, not a valid partial version of it.

---

## 8. Financial & operational specifics [مستقر]

- **Default chart of accounts:** an Egyptian default template is auto-seeded for every new tenant,
  fully editable afterward.
- **Egyptian e-invoice:** a legal requirement (Article 35), built as a core part of the Sales module
  from the first version — not a later add-on.
  - **Mandatory technical spike before writing Sales module code:** a 3–5 day spike dedicated solely
    to e-invoice integration (certificates, sandbox API, accept/reject cycle) must happen **before**
    Sales implementation begins (Sales is step 4 in the module order, §10), so integration surprises
    surface early rather than after the module is built on top of unverified assumptions. **Do not
    skip or shortcut this spike when starting Sales.**
- **Testing strategy:**
  - Domain/Application: unit tests, no database.
  - Repositories: integration tests against a real test database.
  - Critical business flows only: e2e tests.
- **Backup:**
  - Web: part of the (currently deferred) hosting decision — managed services are expected to
    provide this automatically once that decision is made.
  - Desktop: scheduled local `pg_dump` plus a manual export button.
- **Restore drill (mandatory, not optional):** a backup that has never been restored is not verified.
  - Desktop: a monthly script performs a trial restore into a temporary database and confirms
    success.
  - Web: a quarterly restore drill (manual, initially) from the latest snapshot, documented in a
    checklist.

---

## 9. Frontend architecture [مستقر]

### 9.1 Stack (applies across all six modules)

- **React.**
- **shadcn/ui + Tailwind**, chosen after explicit comparison with Ant Design, PrimeReact, and
  Mantine — priority was a distinctive visual identity rather than an off-the-shelf template look.
- **TanStack Table** for data-dense tables (invoices, stock movements, journal entries) — an area
  shadcn/ui alone is weak in.
- **State management:** Zustand for local/client state, React Query for server state. Chosen over
  Redux Toolkit specifically to avoid unjustified boilerplate — do not introduce Redux.
- **Language & direction:** Arabic-only UI today, RTL, with no direction-switching logic. Built via
  translation keys (**i18n-ready from day one**) — because the cost of doing so now is near zero,
  while hardcoding strings would mean rewriting every component if English is added later. Always
  write UI text through the translation-key mechanism, even though only Arabic exists today.
- **Dynamic form engine:** see §7 — this is what makes custom fields real.
- **`<Can>` permission component:** a single shared `<Can permission="...">` component hides/shows UI
  elements based on user permissions, used across all six modules. **Never duplicate permission
  visibility logic locally in a module** — always go through `<Can>`. Its source of truth is the
  Users & Permissions module.

### 9.2 Per-module frontend shape (for context, not a build order)

- **Settings:** single tabbed screen (currency, branches, document numbering, print templates,
  taxes) + a simple print-template editor. Owner/Admin permission only.
- **Users & Permissions:** user list + invite form + interactive Roles × Permissions matrix + a
  filterable audit-log screen. This module is the source of the `<Can>` component used everywhere
  else.
- **Inventory:** item list + item form (using the dynamic form engine for activity-specific
  variants) + stock-movement screen + alerts panel. Item images go through MinIO (§4).
- **Purchases:** wizard/stepper UI (request → approval → order → receipt → invoice) + a "pending
  approvals" screen tied directly to approval chains (simple linear version at this stage, §11).
- **Sales:** two distinct modes — a fast POS screen (search/barcode/instant payment) and a full B2B
  cycle (the inverse of Purchases' wizard). Additional screen: e-invoice status (accepted/rejected by
  the tax authority).
- **Accounting:** interactive collapsible/editable chart-of-accounts tree + journal-entries table +
  financial statements. Auto-generated entries appear "for review" first if the tenant has the
  review option enabled.

---

## 10. Module build order [مستقر]

```
1. Settings + Users & Permissions   ← foundation; must precede everything else
2. Inventory                        ← items are a reference needed before selling/buying
3. Purchases                        ← feeds inventory
4. Sales                            ← consumes from inventory
   ⚠️ Egyptian e-invoice spike (§8) must happen before Sales implementation begins
5. Accounting                       ← listens to events from everything above
```

Do not reorder this without explicit user approval — later modules assume entities and events that
earlier modules establish (e.g. Accounting listens for `sale.invoice_confirmed` and
`purchase.invoice_posted`, which don't exist until Sales and Purchases are built).

### Per-module entity notes (from the master document — for orientation, not a schema to invent from)

- **Settings:** `tenant_settings`, `branches`, `numbering_sequences`, `document_templates`,
  `tax_rules`.
- **Users & Permissions:** `users`, `roles`, `permissions`, `role_permissions`,
  `user_branch_access`, `audit_logs`, `approval_chains`. **Approval chains at this stage are a
  simple linear version only** (employee → direct manager → done) — this is a final decision for
  the MVP, not a stopgap; do not build composite/multi-step approval logic now. Composite chains
  (delegation, amount-based conditions, multi-step) are explicitly deferred to a separate design
  session after core modules are working, without needing to radically change this base schema.
- **Inventory:** `products` (with `attributes JSONB`), `product_variants`, `warehouses`,
  `stock_levels`, `stock_movements`, `units_of_measure`. Valuation method (FIFO/Weighted Average) and
  a dynamic attributes system are customization points.
- **Purchases:** `suppliers`, `purchase_requisitions`, `purchase_orders`, `goods_receipts`,
  `purchase_invoices`. Optional three-way matching, approval chains, multi-currency per supplier.
- **Sales:** `customers`, `quotations`, `sales_orders`, `deliveries`, `sales_invoices`,
  `payments_received`. Mandatory integration: the Egyptian e-invoice/e-receipt system (§8).
- **Accounting:** `chart_of_accounts`, `journal_entries`, `cost_centers`, `bank_accounts`,
  `tax_returns`. Listens to events only — never called directly (§2.6).

---

## 11. Resolved points worth calling out explicitly [مستقر]

- **Monorepo tooling: pnpm + Turborepo** (not Nx). Layer-boundary enforcement (Clean Architecture)
  is done via `eslint-plugin-boundaries` or `dependency-cruiser` on top of Turborepo, deliberately
  avoiding Nx's added complexity. Do not introduce Nx.
- **Approval chains are not deferred** — build the simple linear version now, in Users & Permissions,
  as described in §10.

---

## 12. Deferred / open — do not decide these yourself

| Point | Status | Notes |
|---|---|---|
| Production hosting (VPS vs. managed DB service) | [مؤجل عمدًا] | Unrelated to local module development. Decided near deployment. Affects CD, prod Dockerfile, web backup details. |
| CD pipeline design | [مؤجل عمدًا] | Depends on the hosting decision above. |
| Desktop OS scope beyond Windows | [مؤجل عمدًا] | Packaging concern, decided near desktop-build phase. |
| Shared contracts (`libs/contracts`, Zod) | [مقترح] | Agreed direction; not yet implemented — verify actual state before assuming it exists. |

If a task seems to require resolving one of these, stop and ask instead of picking an answer.

---

## 13. نبغة lessons — priority context

These are the explicit reasons several rules above are non-negotiable rather than stylistic
preferences:

1. **Highest priority — business risk:** a real feature-gating guard, enforced server-side, not just
   hidden in the UI (→ §2.8, `PlanFeatureGuard`).
2. **Medium — future maintainability:** module separation via events instead of direct calls
   (→ §2.6, Event Bus).
3. **Medium — calculation accuracy:** Money Value Object from day one (→ §2.5).

---

## 14. Expected project structure

```
erp-platform/
├── docs/project-master-doc.md         ← master document (source of truth)
├── CLAUDE.md                          ← this file
├── docker-compose.yml                 ← local dev (Postgres + MinIO)
│
├── libs/
│   ├── contracts/                     ← Zod schemas (settings, users-permissions,
│   │                                     inventory, purchases, sales, accounting)
│   ├── shared-kernel/                 ← Money Value Object, base entities
│   └── ui/                            ← shadcn/ui + TanStack Table + <Can> + dynamic form engine
│
├── apps/
│   ├── api/src/
│   │   ├── modules/                   ← 6 modules, each with 4 layers
│   │   ├── database/
│   │   │   ├── public/                ← Prisma schema (platform data)
│   │   │   └── tenant/
│   │   │       ├── migrations/
│   │   │       ├── provisioning.service.ts
│   │   │       └── migration-runner.service.ts
│   │   ├── Dockerfile                 ← [missing] production image — tied to hosting decision
│   │   └── shared/
│   │       ├── guards/plan-feature.guard.ts
│   │       ├── tenancy/
│   │       └── events/
│   │
│   ├── web/src/
│   │   ├── features/                  ← settings/ users-permissions/ inventory/
│   │   │                                 purchases/ sales/ accounting/
│   │   └── app/                       ← routing, layout, i18n provider
│   │
│   └── desktop/
│       └── installer/                 ← NSIS + embedded Postgres binary
│
└── .github/workflows/
    ├── ci.yml                         ← exists
    └── deploy.yml                     ← [missing] tied to hosting decision
```

> **Note:** `docs/project-master-doc.md` now exists in the repository at the path above (added
> after this file was first created) and is readable directly by future sessions.

---

## 15. Development workflow (required for every task)

1. **Inspect before coding** — read the relevant existing files and re-check this document and the
   master document for constraints before touching anything.
2. **Define the scope of one task** — work on one clearly defined task at a time (e.g. "implement the
   Settings module only"). Do not bundle unrelated work into the same change.
3. **Explain the intended changes briefly** before making them, distinguishing clearly between
   existing project decisions, proposed decisions, and your own assumptions.
4. **Implement only that task** — no broad or unrelated changes, no opportunistic refactors of
   nearby code.
5. **Run relevant tests** for what changed.
6. **Run typecheck.**
7. **Run lint.**
8. **Review the resulting diff** before calling anything done.
9. **Do not consider the task complete until verification (tests + typecheck + lint + diff review)
   actually succeeds.** Never claim completion without having actually run and checked these.

---

## 16. Safety rules (hard constraints)

- Never delete files, reset Git history, or perform destructive database operations without explicit
  user approval.
- Never modify a production schema by hand as a substitute for a proper migration (§3).
- Never overwrite or touch files unrelated to the current task's scope.
- Never install a new dependency without a stated justification tied to the current task.
- Never change a **[مستقر]** decision silently — if a task seems to require it, stop and ask first.
- Never invent a requirement, entity, or architectural decision that isn't supported by the master
  document or explicit user instruction.
- If a requirement is ambiguous, or conflicts with an established decision, **stop and ask** rather
  than resolving it yourself.
- Never rely on frontend-only checks (feature hiding, permission hiding) as a substitute for backend
  enforcement (`PlanFeatureGuard`, `<Can>`'s underlying permission checks are UX only).
- Never bypass the Event Bus/Outbox pattern for financial events, and never let Accounting be called
  directly by another business module.
