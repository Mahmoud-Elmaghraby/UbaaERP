# Developer Guide — ERP Platform

This is the practical "how do I get this running, and how do I add to it" guide. For *why* things
are built the way they are, see `CLAUDE.md` (engineering rules) and `docs/project-master-doc.md`
(architecture source of truth). For what already exists module by module, see `docs/claude-context/`.

## 1. Prerequisites

- **Node.js `24.19.0`** (pinned in `.nvmrc` — use `nvm use` if you have nvm).
- **pnpm**, via Corepack (bundled with Node): `corepack enable`.
- **Docker Desktop** (or any Docker engine) — used for local Postgres + MinIO only.
- **Git.**

## 2. Clone and install

```
git clone https://github.com/Mahmoud-Elmaghraby/UbaaERP.git
cd UbaaERP
pnpm install
```

This is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `libs/*`) built with Turborepo
(`turbo.json`). `pnpm install` installs every app/lib's dependencies in one pass.

## 3. Start local infrastructure (Postgres + MinIO)

```
docker compose up -d
```

This starts Postgres 16 on port `5434` (not the default 5432 — see `docker-compose.yml`) and MinIO
on `9000`/`9001`. Data persists in named Docker volumes across restarts.

## 4. Environment files

Three separate `.env` files, one per app/root — copy each `.env.example` and fill it in:

```
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- **Root `.env`** — Postgres/MinIO credentials read by `docker-compose.yml`. The example defaults
  work as-is for local dev; only change them if you need different local credentials.
- **`apps/api/.env`** — `DATABASE_URL` (Prisma, public schema) and JWT settings. Generate a real
  `JWT_ACCESS_SECRET` for anything beyond throwaway local dev. `SECRETS_ENCRYPTION_KEY` (root
  `.env.example`'s comment shows the one-liner to generate it) is only required once a tenant
  stores an encrypted secret (e.g. ETA e-invoice credentials) — safe to leave blank until then.
  **If `pnpm run start:dev` fails with `EACCES: permission denied 0.0.0.0:3000`** (a known Windows
  Hyper-V/WSL2 reserved-port issue, not a real port conflict), add `PORT=4000` to this file and
  make sure `apps/web/.env.local`'s `VITE_API_BASE_URL` points at the same port.
- **`apps/web/.env.local`** — only needs editing if the API isn't running on the default
  `http://localhost:3000` (see the port note above).

## 5. Set up the database

Two separate schema systems, run in this order:

```
# 1. Public/platform schema (Prisma) — tenants table, etc.
cd apps/api
npx prisma migrate deploy
cd ../..

# 2. Provision your first tenant (creates its own Postgres schema and
#    runs every tenant migration under apps/api/src/database/tenant/migrations/
#    against it, optionally seeding an Owner user in the same step)
pnpm --filter api run db:provision
```

`db:provision` prompts for (or accepts as args — check `provisioning.service.ts` for the exact CLI
shape) the tenant name/schema name and, optionally, an owner email/password/name. If you provisioned
a tenant without an owner, or need one on a pre-existing tenant, add one after the fact:

```
pnpm --filter api run db:seed-owner -- <schema_name> <email> <password> "<Full Name>"
```

## 6. Run the app

Two terminals:

```
# Terminal 1 — API (NestJS), default port 3000 (or PORT from apps/api/.env)
pnpm --filter api run start:dev

# Terminal 2 — Web (Vite/React), default port 5173
pnpm --filter web run dev
```

Log in at the web app's URL with the owner credentials from step 5.

## 7. Verification (run before considering any change done)

```
pnpm run typecheck   # turbo run typecheck, all apps/libs
pnpm run lint        # eslint . --ext .ts,.tsx
pnpm run build       # turbo run build, all apps/libs
pnpm run test        # turbo run test, all apps/libs
```

`apps/api` also has narrower Jest projects if you only touched the backend:

```
pnpm --filter api run test:unit          # domain/application, no database
pnpm --filter api run test:integration   # repositories, against a real Postgres schema
pnpm --filter api run test:e2e           # focused end-to-end flows
```

All four root commands (`typecheck`/`lint`/`build`/`test`) passing is the bar for "done" on any
change — see CLAUDE.md §10's testing rules.

## 8. Project structure

```
apps/
  api/    NestJS backend
  web/    React frontend (Vite, shadcn/ui, Tailwind, RTL/Arabic-first)
libs/
  contracts/      Shared Zod schemas — the single source of truth for request/response
                   shapes, used by BOTH backend validation and frontend forms/types.
  shared-kernel/   Cross-module domain primitives — currently just the Money value object.
  ui/              Presentational component library (shadcn/ui primitives, the <Can>
                   permission-gating component, the dynamic custom-fields form engine).
docs/
  project-master-doc.md   Architecture source of truth — read this before CLAUDE.md.
  claude-context/         Per-module build history/status/research docs (one per module,
                           plus a README index) — what's built, what's deferred, and why.
CLAUDE.md   Engineering rules derived from the master doc — read this before writing code.
```

### Backend layering (Clean Architecture, every module)

Each business module (`apps/api/src/modules/<module>/`) follows the same four folders, dependencies
pointing inward only:

```
domain/           Plain TypeScript interfaces/types — the entity shape and its Create/Update
                   input types. No framework imports here.
application/
  ports/           Repository interfaces (e.g. `customer.repository.ts`) + their injection
                   token (`Symbol(...)`).
  services/        The actual business logic — one service class per entity, injected with
                   its port(s), never a concrete repository class directly.
infrastructure/
  persistence/     Kysely repository implementations (tenant schema) or Prisma (public
                   schema) — the only layer allowed to know about SQL/Kysely/Prisma.
  events/          The module's Event Bus publisher (plain CRUD/audit events) and, for
                   Accounting, its @OnEvent auto-posting listeners.
presentation/      NestJS controllers — guards, DTO validation (Zod, via `ZodValidationPipe`
                   + a schema from `@erp-platform/contracts`), and Money<->DTO mapping
                   (`money.mapper.ts`). This is the ONLY layer that should see request/
                   response DTOs — services work with domain entities and the Money VO.
```

Multi-tenancy: one Postgres schema per tenant. `TenantConnectionManager` (injected, global)
resolves the right `Kysely<TenantDatabase>` client for the current request's tenant, always via
`@CurrentTenantSchema()` in the controller — never hardcode a schema name.

### Adding a new tenant-schema migration

Migrations live in `apps/api/src/database/tenant/migrations/`, one file per migration, discovered
automatically by filename sort order (`load-migrations.ts` — no registry file to edit). Pick the
next sequential number after the highest one currently there (check with
`ls apps/api/src/database/tenant/migrations | sort | tail -5`), and follow the existing files'
shape: a default-exported `TenantMigration` object with a `name` matching the filename and an
`async up(db)` using `sql` template tags. Every table gets `created_at`/`updated_at`
(`TIMESTAMPTZ NOT NULL DEFAULT now()`); money columns are always a `BIGINT` minor-units column
(never `NUMERIC`/`FLOAT`) alongside its own `_currency TEXT` column, mirrored by the Money VO at
the domain layer.

### Money

Every monetary value in domain/application code is the `Money` class from `@erp-platform/shared-kernel`
— integer minor units + an ISO 4217 currency code, never a JS `number`/float. Convert at the edges
only: `moneyFromDto()`/`moneyToDto()` (each module's `presentation/money.mapper.ts`) between a
controller's DTO and the domain layer, and `Money.fromMinorUnits(...)` / `.toMinorUnits().toString()`
between a Kysely repository and its `BIGINT` columns.

### Cross-module communication

Business modules never import each other to trigger behavior. Two mechanisms:

- **Plain Event Bus** (`EventEmitter2`, via each module's own `<Module>EventPublisher`) for
  non-financial CRUD/audit events — fire-and-forget, no delivery guarantee needed.
- **Outbox Pattern** (`shared/outbox/`, `OutboxWriterService.write(trx, eventType, payload)`) for
  financial events — written in the SAME database transaction as the business fact it describes
  (e.g. an invoice flipping to `posted`), then reliably re-emitted on the Event Bus by
  `OutboxDispatcherService`'s own poller. Accounting's `AccountingAutoPostingListeners`
  (`@OnEvent(...)` handlers) is the main consumer — it reacts to these events and posts journal
  entries; it is never called directly by Sales/Purchases.

Use the Outbox path whenever the event represents money moving or a ledger-worthy fact; use the
plain publisher for everything else. When in doubt, look at how the most recently built module did
it (check `docs/claude-context/` for the newest module's status doc).

### Contracts (`libs/contracts`)

Every request/response shape is a Zod schema in `libs/contracts/src/<module>/<entity>.contract.ts`,
re-exported from that module's `index.ts` and the library's root `index.ts`. Backend controllers
validate incoming bodies with `new ZodValidationPipe(theCreateSchema)`; the frontend imports the
same schema/types for its forms. Add the schema here first, then use its inferred `Dto` type on
both sides — never hand-write a duplicate interface.

### Frontend structure

`apps/web/src/features/<module>/` — one subfolder per business entity within a module (route,
list page with TanStack Table, create/edit form, API hooks via React Query). Server state lives in
React Query; local/UI-only state in Zustand. Permission-gated UI uses the shared `<Can>` component
from `libs/ui` — never duplicate a permission check inline. Custom fields on a document render
through the shared dynamic form engine (`libs/ui`), driven by that tenant's
`custom_field_definitions` (Settings module) — never a bespoke per-entity custom-fields UI.

### Typical steps to add a new document/entity to an existing module

1. Migration (see above).
2. `domain/<entity>.entity.ts` — the interface + Create/Update input types.
3. `application/ports/<entity>.repository.ts` — the port interface + injection token.
4. `application/services/<entity>s.service.ts` — business logic, injected with the port.
5. `infrastructure/persistence/kysely-<entity>.repository.ts` — the Kysely implementation.
6. `presentation/<entity>s.controller.ts` — guards (`JwtAuthGuard`, `PermissionsGuard`,
   `@RequirePermissions(...)`), Zod-validated DTOs, Money mapping.
7. `libs/contracts/src/<module>/<entity>.contract.ts` — the Zod schemas, exported from that
   module's `index.ts`.
8. Wire the new provider/controller into `<module>.module.ts`.
9. Frontend: `apps/web/src/features/<module>/<entity>/` — route, list, form, hooks.
10. Tests: unit test the service (no DB), integration test the repository (real Postgres).
11. Run the full verification suite in §7 before calling it done.

**Before adding a genuinely new document type, field, or module boundary that isn't already in
`docs/project-master-doc.md`**, check CLAUDE.md §17.3 — this needs an explicit decision, not a
silent addition, same as every prior scope addition in this project's history (RFQ, Purchase
Returns, Sales Credit Notes, the POS feature currently being built).

## 9. Where to go for more context

- `CLAUDE.md` — the full engineering rulebook (architecture, module boundaries, testing strategy,
  workflow rules).
- `docs/project-master-doc.md` — the original architecture/scope source of truth.
- `docs/claude-context/README.md` — index of what's built in each module, in build order, plus
  known gaps and open decisions. Read the relevant module's status doc before touching it.
