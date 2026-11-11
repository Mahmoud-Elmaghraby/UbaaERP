# Nabgha installer lessons, mapped to our desktop installer (2026-10-15)

Source: `M:\Projects\Nabgha\docs\INSTALLER_DEEP_DIVE_v2.md` (problems 1–10 plus operational notes) and the installer section of `DEVELOPER_GUIDE.md`.

## Nabgha lessons and our status

| Nabgha problem | Our status |
|---|---|
| pnpm hoisting left packages out of the installer (tslib, workspace packages); fixed with a hand-kept `node_modules_real` that drifted (archiver/exceljs/puppeteer missing) | `stage.mjs` uses `pnpm deploy --prod`, then runs a static and runtime resolve check. The build fails instead of shipping. |
| Prisma client not generated, or the wrong Prisma version | `stage.mjs` copies the generated client and fails if the Windows engine is missing. |
| Public tables only created by `prisma db push` | Public migrations are applied from `prisma/migrations` in Prisma's own format; no CLI is needed. |
| Node.js path detection (nvm4w, `where node`, the exe-name replace bug) | Not applicable: everything runs on Electron's own Node (`ELECTRON_RUN_AS_NODE`). |
| Hard-coded dev paths (`__dirname` up to `packages/...`) that fail only when the feature is used | Audited: only `public-migrations.ts` and `load-migrations.ts` use `__dirname`, and both resolve inside the staged api folder. |
| Puppeteer/Chromium cached in the user profile, crashing at bootstrap | Not applicable: the API has no puppeteer, playwright or sharp. |
| Startup failure quit silently | `main.ts` shows `dialog.showErrorBox` with the logs path. |
| `pg_dump` via a URL failed with `spawn UNKNOWN` | Not applicable: `postgres.ts` passes separate args with `PGPASSWORD` in env, which is Nabgha's proposed fix. |
| Different postgres password on some PCs (an existing Postgres install) | Not applicable: we run our own cluster and service on our own port, with per-machine generated secrets. |
| Single installer for install and update, with a pre-update backup | Same design, plus a mandatory pre-update `pg_dump` in `setup.js`. |
| Migrations run on every app start | Same (`main.ts`: config → DB → migrations → API). |
| The only reliable field diagnosis was running the step by hand in a console | **Added:** the installer writes `repair.cmd` into the install folder (see below). |

## Our own first-install failures (2026-10-15) and fixes

1. **`ERR_REQUIRE_ESM` on `kysely` 0.29 (ESM-only) under Electron 32's Node 20.18.**
   - The staging smoke test ran on the build machine's Node 22, so it passed.
   - Fix: Electron bumped to 44.7.2.
   - Fix: the smoke test now runs on Electron's Node (`ELECTRON_RUN_AS_NODE=1`), so a runtime mismatch fails the build.
2. **Missing Visual C++ runtime on a clean Windows.** The bare PG binaries zip doesn't include it; Nabgha got it from the EDB installer.
   - Fix: `vc_redist.x64.exe` is staged and installed silently, only when the runtime is missing.
3. **Installer details hidden, and the wizard not always in Arabic.**
   - Fix: a `customHeader` macro sets `ShowInstDetails show` (and `ShowUninstDetails`).
   - Fix: `installerLanguages: [ar_SA]` and `displayLanguageSelector: false`.

## `repair.cmd`

- **When it is written:** at install time, before the database step, so it exists even when that step fails.
- **What it does:** it must be run as admin. It re-runs `setup.js install`, which is idempotent: backup, start the DB, then pending migrations. The output stays on screen.
- **Pointer:** the failure message box tells the user about it.

## Pre-delivery checklist (adapted from Nabgha)

- `build-installer.bat` completes, including the Electron-Node smoke test.
- Install on a clean Windows VM before the customer: fresh install, `/setup` owner, sale, print, backup.
- Install the new exe over the old one with data present; the pre-update backup appears in `setup.log`.
- Tell the customer to quit from the tray before updating.
- **Customer PC minimum:** Windows 10/11 64-bit, 8 GB RAM, SSD.
