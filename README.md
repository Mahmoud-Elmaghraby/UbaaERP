# UbaaERP

A production-grade, multi-tenant ERP platform: Inventory, Purchases, Sales (including a POS mode,
in progress), and Accounting, built on Clean Architecture with strong domain rules for the
financial modules. Arabic-first, RTL, and designed to be i18n-ready throughout.

> The project's final customer-facing product name/branding is still an open decision — see
> `docs/claude-context/settings-module-status.md`'s "Visual identity" section. "UbaaERP" is this
> repository's working name.

## Tech stack

- **Backend:** NestJS + TypeScript, PostgreSQL (Prisma for the shared public schema, Kysely for
  per-tenant schemas — one Postgres schema per tenant).
- **Frontend:** React, shadcn/ui + Tailwind, TanStack Table, Zustand, React Query.
- **Shared:** a Zod-based contracts library (`libs/contracts`) used by both backend validation and
  frontend forms, and a Money value object (`libs/shared-kernel`) — no floating-point numbers
  anywhere in monetary business logic.
- **Cross-module communication:** an Event Bus for plain events and the Outbox Pattern for
  financial events, so business modules (Sales, Purchases, Inventory) never call Accounting
  directly.

## Getting started

See **[`DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md)** for everything needed to clone, install,
configure, run, and contribute to this project — prerequisites, environment setup, running the
database and both apps, verification commands, the architecture/layering conventions, and a
step-by-step checklist for adding a new feature.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — the engineering rulebook (architecture, module boundaries, testing
  strategy, workflow rules).
- [`docs/project-master-doc.md`](./docs/project-master-doc.md) — the original architecture/scope
  source of truth.
- [`docs/claude-context/`](./docs/claude-context/) — per-module build history, status, and
  research docs, in build order (see that folder's own `README.md`).
