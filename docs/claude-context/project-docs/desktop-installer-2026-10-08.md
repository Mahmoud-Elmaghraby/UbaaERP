# Desktop installer (Windows exe): 2026-10-08

Commit `8a60c2f` (cloud clone). Delivered to `M:\Projects\erp-platform` as `ubaa-update-2026-10-08-desktop.tgz`, which has been extracted there and checksum-verified.

## Studied first: Nabgha's approach

- **Runtime:** Electron spawns the API with a separately installed Node.js.
- **Installer:** a custom NSIS script installs the EnterpriseDB PostgreSQL installer (349MB) on port 5432 and a Node MSI.
- **Passwords:** hard-coded for every customer (`123456`, `nabgha123`, one shared JWT secret).
- **Dependencies:** a hand-maintained `node_modules_real`. It broke 3 customers in Aug 2026.
- **Ports:** `killPortUser` killed whatever process held the port.

## Decisions (user: "شوف الافضل واعمله" for Postgres; LAN optional; local + GitHub build; manual updates)

- **PostgreSQL:** official Windows *binaries* (bin, lib and share only). It runs as our own service `ERPPlatformDB` under NetworkService, on its own port (54329 and up). It never conflicts with a customer's existing Postgres. The PG 17 major version is pinned.
- **No Node.js install:** the API and the setup scripts run on Electron's Node (`ELECTRON_RUN_AS_NODE`).
- **Secrets:** generated per machine at install time.
  - `config.json` is readable by users.
  - The superuser password is kept in `admin/admin.json`, readable by Administrators and SYSTEM only.
- **App database role:** the app connects with a least-privilege role (not a superuser).
- **No account in the installer:** a first-run `/setup` page creates the Owner. It works only once (advisory lock, then 409).
- **One fixed tenant (`company`):** provisioned with the cloud's own `provisionTenant` / `applyPendingMigrationsForTenant` code.
- **Public schema migrations without the Prisma CLI:** they are applied in Prisma's own `_prisma_migrations` format.
- **Local file storage instead of MinIO:** `LocalObjectStorage`, served through HMAC-signed `/files` links.
- **Single origin:** the API serves `web/dist`. The SPA fallback is chosen by navigation headers, so API paths are unaffected.
- **LAN access:** off by default. It is toggled from the tray and binds to 0.0.0.0. A private-profile firewall rule is added.
- **Backups:**
  - daily `pg_dump`, keeping 14
  - a manual backup from the tray
  - a `pre-update` dump before migrations on every update
  - a restore drill was verified manually
- **Update and uninstall:**
  - Updating means running a newer installer over the old one; the DB service is stopped while files are replaced.
  - Uninstall keeps the data unless the user explicitly confirms deletion.
- **Build:** `stage.mjs` runs `pnpm deploy --prod`, then a static plus runtime check that every required package resolves. The build fails otherwise, which is the Nabgha lesson.
- **Font:** IBM Plex Sans Arabic is now bundled through `@fontsource` (new dependency; reason: offline desktop). Google Fonts was removed.

## Files

- **API:**
  - `shared/config/deployment.ts`
  - `shared/storage/local-object-storage.ts` and `local-files.controller.ts`
  - `shared/desktop/*`
  - `database/public/public-migrations.ts`
  - `database/desktop/desktop-setup.command.ts`
- **Contracts:** `runtime.contract.ts`.
- **Web:**
  - `lib/runtime.ts`
  - `features/desktop/setup-page.tsx`
- **Desktop:**
  - `src/{main,setup,splash,strings}.ts`
  - `src/shared/{config,paths,postgres,process,api-env}.ts`
  - `installer/installer.nsh`
  - `electron-builder.yml`
  - `scripts/stage.mjs`
  - `build-installer.bat`
  - `README.md`
- **CI:** `.github/workflows/desktop.yml` (manual or `v*` tags; uploads the exe as an artifact).

## Verified (Linux sandbox)

- **Full install flow:** `setup.js install` ran on real Postgres 16 binaries: initdb, settings, start, role and DB, migrations.
- **Re-run as an update:** it took a pre-update backup, then reported "up to date". `pg_restore` of the backup into a temp DB succeeded. Uninstall stopped the DB.
- **API in desktop mode, using the env from `buildApiEnv`:**
  - `/runtime` and the SPA are served
  - logo upload goes to local storage, the signed link works, a tampered link gets 404
  - the refresh cookie is not Secure over http, and a reload keeps the session
- **Playwright:** `/login` redirects to `/setup`, the password-mismatch error shows, sign-in lands on home, and `/setup` cannot be reached afterwards.
- **Tests:** api 516, desktop 8 and shared-kernel 30 all pass. Typecheck and lint are clean.

## NOT verified here (needs Windows or network)

- The real Electron run.
- NSIS packaging.
- Windows service registration and ACLs.
- The Prisma Windows engine.
- The PG zip download (EDB and binaries.prisma.sh are blocked in the sandbox).

First real test: run the GitHub Action or `apps\desktop\build-installer.bat` on Windows, then install on a clean VM.

## First real build and client install (2026-10-15)

- **Build:** v0.1.0 was built on the user's PC. It needed `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` because the GitHub download hangs; `ELECTRON_BUILDER_BINARIES_MIRROR` likewise if NSIS hangs.
- **Install failed on the client's PC.** The exact error has not been received yet.
- **Gap found by comparing with Nabgha:** the EDB installer Nabgha uses bundles the Visual C++ 2015-2022 runtime. The bare binaries zip we use does not, so on a clean Windows `initdb` / `postgres.exe` cannot start because `VCRUNTIME140.dll` is missing.
- **Fix (edited directly on the user's device, not yet built or committed):**
  - `stage.mjs` step 5 stages `vc_redist.x64.exe` (from aka.ms; `--vc-redist <file>` for offline use).
  - `electron-builder.yml` ships it as the `vcredist` resource.
  - `installer.nsh` `ensureVcRuntime` checks `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64 Installed`. Only when the runtime is missing does it run `/install /quiet /norestart`, accepting exit codes 0, 3010 and 1638.
- **Still to confirm:** the client's `C:\ProgramData\ERP Platform\logs\setup.log`, to see whether that was the only cause.

## Next

- Code signing.
- Auto-update.
- Scheduled monthly restore drill (CLAUDE.md §8).
- Final product name and icon.
- `pg_upgrade` path if the PG major version is ever bumped.
- Electron 32 is old; consider a bump.
