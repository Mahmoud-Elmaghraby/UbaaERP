# Platform admin panel: how Nabgha does it, and our plan (2026-10-08, not built yet)

## How Nabgha does it

**API module `platform`:**
- Endpoints, all behind `PlatformJwtAuthGuard`:
  - `platform/tenants`: list, get, create, update, toggle-active
  - `platform/plans`
  - `platform/stats`
- Platform admins are a separate Prisma model, `PlatformUser`, signed with a separate `PLATFORM_JWT_SECRET`.

**Web:**
- Pages: `/platform/login`, `/platform/dashboard`, `/platform/tenants`, `/platform/plans`.
- Separate `PlatformLayout` and a separate auth store.

**Creating a tenant:**
1. Insert the `public.tenants` row (slug, plan, `tenant_<uuid>` schema).
2. `CREATE SCHEMA`.
3. Run all `.sql` migrations.
4. Insert the admin user and `center_settings`.

**Tenant login:** by `slug` + username. Login is refused if `isActive = false`.

**Weaknesses (do not copy):**
- Three separate copies of the provisioning logic: the platform use-case, desktop `initDesktopSetup`, and `migrate.js`.
- Tenant creation is not transactional and has no failure tracking.
- The platform admin password is hard-coded in `migrate.js` (`Nabgha@Admin2026`).
- The plan `features` JSON was never enforced (the known Nabgha lesson).
- The desktop build also ran with `MULTI_TENANT=true` and shipped the platform panel.

## Our project today

**Fully multi-tenant (schema-per-tenant), already in place:**
- `public.tenants`, `plans`, `plan_features`, `migration_failures`.
- `PlanFeatureGuard`, enforced on 48 controllers.
- `provisionTenant`, which provisioning and migration share as one code path.
- The batch migration runner, which continues past failures.
- `retry-failed-migrations`.
- `TenantConnectionManager`, which keeps one pool per schema.

Desktop runs the same code with one fixed tenant (`company`).

**Missing for SaaS operation:**
- A platform-user model and platform login (CLAUDE.md §2.2 already lists "platform users" as part of `public`).
- Tenant create/suspend from an API or UI. Today this is CLI only (`db:provision`).
- `tenants.slug` and `status`. Login currently asks for the raw schema name.
- Plan management UI.
- A view of migration failures.

## Proposed design

- **Module:** a `platform` module in the API, on the public schema via Prisma.
  - `PlatformUser`: email, bcrypt password, 2FA later.
  - Its own JWT audience/secret.
  - Fails closed: a tenant token never works on `/platform/*`, and a platform token never works on tenant routes.
- **First platform admin:** created via a CLI command (`db:create-platform-admin`). Never hard-coded.
- **Tenant creation:** the platform endpoint reuses `provisionTenant` and adds no new code path.
  - Status goes `provisioning`, then `active` or `failed`, with a retry button that uses the existing retry command logic.
  - The Owner user is seeded through the existing owner-seed.
- **Tenant table changes:** add `slug` (company code) and `status` (`active` / `suspended`).
  - Login uses the company code; the server resolves the schema, so the schema name is never typed.
  - A suspended tenant is blocked at login, at refresh, and on every request (cached status check). Nabgha only blocked at login.
- **Admin pages:**
  - dashboard (counts)
  - tenants: search, create, suspend/activate, change plan, migration status
  - plans and features
  - platform admins
- **Web:** a `/platform/*` area with its own layout and auth store.
- **Desktop:** the platform module is not registered at all when `DEPLOY_MODE=desktop` (CLAUDE.md §2.3: no tenant switching on desktop).
- **Out of scope until decided:** billing, subscriptions and self-signup.
