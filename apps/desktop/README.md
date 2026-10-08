# Desktop (Windows) build

One installer (`ERP Platform-Setup-<version>.exe`) that gives a customer the whole
system on one PC, fully offline (CLAUDE.md §2.4, §6).

## How it works

```
ERP Platform.exe (Electron)
 ├─ PostgreSQL 17  ← Windows service "ERPPlatformDB", own data dir, own port (54329+)
 ├─ setup / migrations  ← the app's own exe in Node mode (ELECTRON_RUN_AS_NODE)
 └─ NestJS API child    ← same exe in Node mode, DEPLOY_MODE=desktop
       serves the API + the built web app on http://127.0.0.1:<port>
       (0.0.0.0 when the owner turns on "network access" from the tray)
```

* **No Node.js install.** Electron ships Node; the API and the setup scripts run on it.
* **No Docker, no MinIO.** Files go to the local disk (`LocalObjectStorage`, signed links).
* **One fixed tenant** (`company`), provisioned by the installer with the same
  code the cloud uses (`apps/api/src/database/desktop/desktop-setup.command.ts`).
* **No password ships in the installer.** The first person to open the app creates
  the Owner account (`/setup` page → `POST /desktop/setup`, works only while no user exists).
* **Per-machine secrets** (DB password, JWT, file-link signing, encryption key) are
  generated at install time.

### Where things live on the customer's PC

| Path | What |
|---|---|
| `C:\Program Files\ERP Platform\` | the app (replaced on every update) |
| `C:\ProgramData\ERP Platform\config.json` | ports, app DB credentials, secrets |
| `C:\ProgramData\ERP Platform\admin\admin.json` | Postgres superuser password (Administrators only) |
| `C:\ProgramData\ERP Platform\pgdata\` | the database cluster |
| `C:\ProgramData\ERP Platform\files\` | uploaded files (logos, product images, attachments) |
| `C:\ProgramData\ERP Platform\backups\` | daily backups (14 kept), manual, pre-update (5 kept) |
| `C:\ProgramData\ERP Platform\logs\` | `setup.log`, `api.log` |

### Install / update / uninstall

* **Install:** admin once (UAC). Creates the cluster, the service, the app role +
  database, applies all migrations, adds a *private-network-only* firewall rule.
* **Update:** run the newer installer over the old one. The DB service is stopped
  while files are replaced, a `pre-update-*.dump` backup is taken, then new migrations run.
  Data is never touched by the file replacement.
* **Uninstall:** removes the service and firewall rule. Data is **kept** unless the
  user answers *Yes* to the explicit "delete all data?" question.

### Backups and restore

* Daily automatic `pg_dump` (custom format), plus *نسخة احتياطية الآن* in the tray.
* Restore (admin command prompt):
  ```
  set PGPASSWORD=<superuserPassword from admin.json>
  "C:\Program Files\ERP Platform\resources\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p <port> -U postgres -d erp_desktop --clean --if-exists "<backup>.dump"
  ```

## Building the installer

On Windows (no admin needed):

```
apps\desktop\build-installer.bat
```

or on GitHub: **Actions → desktop-installer → Run workflow** (also runs for `v*` tags);
the `.exe` is attached to the run.

What the build does (`scripts/stage.mjs`, then `electron-builder`):

1. builds shared-kernel, contracts, API (incl. `prisma generate` with the Windows engine),
   web (`VITE_API_BASE_URL=""` — same origin) and this package;
2. `staging/api`: `pnpm deploy --prod` (real folders, no symlinks) + generated Prisma client,
   CLI-only packages pruned, compiled specs dropped;
3. **fails the build** if any package required by the compiled API can't be resolved
   from `staging/api` (the نبغة `node_modules_real` incident can't recur);
4. `staging/web`, and `staging/pgsql` = `bin/lib/share` from the official PostgreSQL
   Windows binaries zip (downloaded once into `.cache/`; or `--pg-zip <file>`;
   version: `PG_WINDOWS_VERSION`, default in `stage.mjs`).

The version of the installer is `version` in `apps/desktop/package.json`.

**Pin the PostgreSQL major version.** A data directory created by PostgreSQL 17 can't be
opened by 18; changing the major version later needs a `pg_upgrade` step in `setup.ts`.

## Developing

* `pnpm --filter desktop test` — unit tests of the shell's logic.
* The full install flow runs on Linux too (no Windows service, plain `pg_ctl`):
  ```
  node apps/desktop/scripts/stage.mjs --no-pg
  ERP_DESKTOP_DATA_DIR=/tmp/erp-desktop ERP_DESKTOP_PG_BIN=/usr/lib/postgresql/16/bin \
    node apps/desktop/dist/setup.js install --version 0.0.1 --resources apps/desktop/staging
  ```
  (run as a non-root user — `initdb` refuses root).

## Not done yet

* Code signing (SmartScreen warns on unsigned installers) — needs a certificate.
* Automatic updates (today: a newer installer over the old one).
* Monthly automatic restore drill (CLAUDE.md §8) — the backup is restorable (verified
  manually), the scheduled drill isn't built.
* Product name/icon are placeholders until the name is final.
