# Session handoff — 2026-10-04

Short, factual addendum for whoever picks this repo up next. Read `next-steps-backlog.md` first for the project-wide open items; this file only records what happened *after* the 2026-09-13 docs refresh.

## Git state
- Multi-currency (3 phases) + shared Attachments + the two contained fixes + the GoodsReceipts outbox-symmetry fix + the 2026-09-13 docs refresh are **committed and pushed**: commit `4a5c3e5` on `master` (`b3da02a..4a5c3e5`), remote `https://github.com/Mahmoud-Elmaghraby/UbaaERP.git`.
- `lint-out.txt`, `test-out.txt`, `typecheck-out.txt` at the repo root are untracked verification logs. They were intentionally NOT meant for commit; consider adding them to `.gitignore`.
- On this Windows machine `git status` lists ~32 files as modified (CLAUDE.md, many controllers, `main.ts`, ...). These are **line-ending-only differences (LF vs CRLF)**: `git diff --ignore-space-at-eol` is empty and numstat shows equal added/deleted counts. No real uncommitted code. A `.gitattributes` (`* text=auto`) or consistent `core.autocrlf` would remove the noise. Do not treat those files as unfinished work.

## Running the app locally (Windows, verified 2026-10-04)
- Repo path on the user's machine: `M:\Projects\erp-platform`.
- Real tenant for local dev: schema **`demo`** ("شركة تجريبية"). The `test_*` / `test_e2e_*` / `test_integration_*` tenants in the `tenants` table are automated-test leftovers — ignore them.
- An Owner was created on `demo` with `pnpm --filter api run db:seed-owner -- demo owner@example.com "<password>" "Mahmoud"`. An older `demo@example.com` ("Demo Owner") also exists with an unknown password. Passwords are bcrypt-hashed and cannot be recovered; just seed a new Owner if needed. (Never commit passwords — this repo is public.)
- PowerShell treats `<...>` as redirection: placeholders in command examples must be replaced with real values.
- **Vite's default port 5173 is blocked on this machine** (`EACCES ::1:5173`): Windows/Hyper-V reserves TCP 5131–5933 (check with `netsh interface ipv4 show excludedportrange protocol=tcp`). Run the web app on a port outside the excluded ranges: `pnpm --filter web run dev -- --port 8080`, then open `http://localhost:8080`. The reserved ranges can change after a reboot/WSL restart. API CORS reflects the origin in dev, so any web port works. API port 3000 was not excluded on 2026-10-04 (if it ever is, see DEVELOPER_GUIDE §4: `PORT=4000` + `VITE_API_BASE_URL`).
- Start order: `docker compose up -d` (Postgres 5434 + MinIO 9000/9001) → `pnpm install` → `cd apps\api; npx prisma migrate deploy` → API `pnpm --filter api run start:dev` → web as above. If the API reports a missing relation/column on `demo`, that tenant likely lacks tenant migrations 0070–0074 (company profile, attachments, exchange_rates, exchange gain/loss account, multi-currency toggle seed) — apply them before debugging further.

## Tooling note
The Cowork/remote shell (`device_bash`) was down 2026-09-08 → ~2026-10-04 due to a Windows-update Plan9 share bug and is working again, but it runs in a Linux VM (no pnpm, no Docker). Run `pnpm`/`docker` natively in the user's PowerShell and paste output back. Avoid running `git` through that VM on the Windows-mounted repo: it can leave a stale `.git/index.lock` that blocks the user's own git (one such lock was created and removed on 2026-10-04).
