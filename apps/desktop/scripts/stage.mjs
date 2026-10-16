#!/usr/bin/env node
/**
 * Prepares apps/desktop/staging/ — everything electron-builder bundles as
 * extraResources — and FAILS LOUDLY if anything is missing.
 *
 *   staging/api    API dist + production node_modules (pnpm deploy, real
 *                  folders, no symlinks) + prisma/migrations
 *   staging/web    built web app (same-origin API: VITE_API_BASE_URL="")
 *   staging/pgsql  PostgreSQL Windows binaries (bin/lib/share only)
 *
 * نبغة kept a hand-maintained `node_modules_real` next to the API, and an
 * installer built "successfully" while missing three libraries reached
 * three customers. Here the production dependency set is derived from
 * apps/api/package.json every time, and a smoke test requires the whole
 * API module graph from staging/api before anything is packaged.
 *
 * Usage:  node scripts/stage.mjs [--skip-build] [--no-pg] [--pg-zip <file>]
 * Env:    PG_WINDOWS_VERSION (default below), PG_WINDOWS_ZIP_URL
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PG_WINDOWS_VERSION = process.env.PG_WINDOWS_VERSION ?? '17.10-1';
const PG_ZIP_URL =
  process.env.PG_WINDOWS_ZIP_URL ??
  `https://get.enterprisedb.com/postgresql/postgresql-${PG_WINDOWS_VERSION}-windows-x64-binaries.zip`;

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..', '..');
const staging = join(desktopDir, 'staging');
const cacheDir = join(desktopDir, '.cache');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const IS_WINDOWS = process.platform === 'win32';

function step(title) {
  console.log(`\n▶ ${title}`);
}

function sh(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: IS_WINDOWS, // pnpm is a .cmd shim on Windows
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed (exit ${result.status}).`);
  }
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

// ── 1. Build ──────────────────────────────────────────────────────────────
if (!flag('--skip-build')) {
  step('Building libraries, API, web and desktop');
  sh('pnpm', ['--filter', '@erp-platform/shared-kernel', 'build']);
  sh('pnpm', ['--filter', '@erp-platform/contracts', 'build']);
  sh('pnpm', ['--filter', 'api', 'exec', 'prisma', 'generate']);
  sh('pnpm', ['--filter', 'api', 'build']);
  // Desktop serves web and API from one origin → relative API URLs.
  sh('pnpm', ['--filter', 'web', 'build'], { env: { VITE_API_BASE_URL: '' } });
  sh('pnpm', ['--filter', 'desktop', 'build']);
}

// ── 2. API ────────────────────────────────────────────────────────────────
step('Staging the API (production dependencies only)');
rmSync(join(staging, 'api'), { recursive: true, force: true });
rmSync(join(staging, 'web'), { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
sh('pnpm', [
  '--filter', 'api', 'deploy', '--prod', '--legacy', '--ignore-scripts',
  '--config.node-linker=hoisted', join(staging, 'api'),
]);
const stagedApi = join(staging, 'api');
for (const extra of ['src', 'test', 'jest.config.js', 'tsconfig.json', 'tsconfig.spec.json', '.env', '.env.example']) {
  rmSync(join(stagedApi, extra), { recursive: true, force: true });
}

// Compiled unit tests (src/**/*.spec.ts) are not part of the product.
(function dropSpecs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) dropSpecs(path);
    else if (/\.spec\.js(\.map)?$/.test(entry.name)) rmSync(path);
  }
})(join(stagedApi, 'dist'));

// The generated Prisma client (incl. the Windows query engine) lives next
// to the workspace's @prisma/client; --ignore-scripts skipped regenerating it.
const workspacePrismaClient = realpathSync(join(repoRoot, 'apps', 'api', 'node_modules', '@prisma', 'client'));
const generated = join(dirname(dirname(workspacePrismaClient)), '.prisma', 'client');
if (!existsSync(join(generated, 'index.js'))) fail(`Generated Prisma client not found at ${generated} — run prisma generate.`);
cpSync(generated, join(stagedApi, 'node_modules', '.prisma', 'client'), { recursive: true });
if (!flag('--no-pg')) {
  const engine = readdirSync(join(stagedApi, 'node_modules', '.prisma', 'client')).find((f) => /windows.*\.dll\.node$/.test(f));
  if (!engine) {
    fail('The Prisma Windows query engine is missing (schema.prisma binaryTargets must include "windows", then prisma generate).');
  }
}

// CLI-only packages pulled in as peers of @prisma/client — never loaded at run time.
for (const pkg of ['prisma', '@prisma/engines', '@prisma/fetch-engine', '@prisma/config', 'effect', 'fast-check', 'typescript']) {
  rmSync(join(stagedApi, 'node_modules', pkg), { recursive: true, force: true });
}

// Run it on Electron's own Node (ELECTRON_RUN_AS_NODE) — the exact runtime the
// installer and the app use on the customer's PC. Running it on the build
// machine's Node hid a real failure: kysely 0.29 is ESM-only, which Node 22
// loads via require() but Electron 32's Node 20.18 does not (ERR_REQUIRE_ESM).
step('Smoke test: requiring the whole API module graph from staging/api (on Electron\'s Node)');
const electronExe = createRequire(join(desktopDir, 'package.json'))('electron');
if (typeof electronExe !== 'string' || !existsSync(electronExe)) fail('Electron binary not found — run pnpm install first.');
const smoke = spawnSync(
  electronExe,
  ['-e', "require('./dist/app.module'); require('./dist/database/desktop/desktop-setup.command'); console.log('ok')"],
  {
    cwd: stagedApi,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      ELECTRON_RUN_AS_NODE: '1',
      DOTENV_CONFIG_PATH: '__none__',
      DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:1/smoke',
      JWT_ACCESS_SECRET: 'smoke-test-secret-0123456789',
      NODE_PATH: '',
    },
  },
);
if (smoke.status !== 0 || !smoke.stdout.includes('ok')) {
  fail(`staging/api cannot load its own code — a dependency is missing:\n${smoke.stderr || smoke.stdout}`);
}
// Static pass too: every package any compiled file require()s must resolve
// from staging/api (catches imports outside AppModule's graph, e.g. main.ts).
const missing = new Set();
const requireFrom = createRequire(join(stagedApi, 'dist', 'main.js'));
(function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith('.js')) {
      for (const [, spec] of readFileSync(path, 'utf8').matchAll(/require\("([^".][^"]*)"\)/g)) {
        if (isBuiltin(spec)) continue;
        try {
          requireFrom.resolve(spec);
        } catch {
          missing.add(spec);
        }
      }
    }
  }
})(join(stagedApi, 'dist'));
if (missing.size > 0) fail(`staging/api is missing packages: ${[...missing].join(', ')}`);
console.log('  all modules resolve');

// ── 3. Web ────────────────────────────────────────────────────────────────
step('Staging the web app');
const webDist = join(repoRoot, 'apps', 'web', 'dist');
if (!existsSync(join(webDist, 'index.html'))) fail('apps/web/dist is missing — build the web app first.');
cpSync(webDist, join(staging, 'web'), { recursive: true });

// ── 4. PostgreSQL binaries ─────────────────────────────────────────────────
if (flag('--no-pg')) {
  console.log('\n(skipping PostgreSQL binaries: --no-pg)');
} else if (existsSync(join(staging, 'pgsql', 'bin', 'pg_ctl.exe'))) {
  console.log('\n▶ PostgreSQL binaries already staged');
} else {
  step(`Staging PostgreSQL ${PG_WINDOWS_VERSION} (Windows x64 binaries)`);
  mkdirSync(cacheDir, { recursive: true });
  let zip = option('--pg-zip') ?? join(cacheDir, `postgresql-${PG_WINDOWS_VERSION}-windows-x64-binaries.zip`);
  if (!existsSync(zip)) {
    console.log(`  downloading ${PG_ZIP_URL}`);
    const response = await fetch(PG_ZIP_URL);
    if (!response.ok) {
      fail(`Download failed (${response.status}). Download the zip manually and pass --pg-zip <file>, or set PG_WINDOWS_ZIP_URL.`);
    }
    const { writeFile } = await import('node:fs/promises');
    await writeFile(zip, Buffer.from(await response.arrayBuffer()));
  }
  const extractTo = mkdtempSync(join(tmpdir(), 'pgsql-'));
  if (IS_WINDOWS) execFileSync('tar', ['-xf', zip, '-C', extractTo], { stdio: 'inherit' });
  else execFileSync('unzip', ['-q', zip, '-d', extractTo], { stdio: 'inherit' });
  const source = join(extractTo, 'pgsql');
  // Server + client tools only: no pgAdmin, StackBuilder, docs, headers or debug symbols.
  for (const part of ['bin', 'lib', 'share']) {
    cpSync(join(source, part), join(staging, 'pgsql', part), { recursive: true });
  }
  rmSync(extractTo, { recursive: true, force: true });
  for (const exe of ['postgres.exe', 'initdb.exe', 'pg_ctl.exe', 'pg_isready.exe', 'psql.exe', 'pg_dump.exe', 'pg_restore.exe']) {
    if (!existsSync(join(staging, 'pgsql', 'bin', exe))) fail(`PostgreSQL zip is missing bin/${exe}.`);
  }
}

// ── 5. Microsoft Visual C++ runtime ───────────────────────────────────────
// The PostgreSQL binaries are built with MSVC and need VCRUNTIME140 — present
// on most PCs (any app may have installed it) but NOT on a clean Windows. The
// EDB installer Nabgha used bundles it; the bare binaries zip does not. The
// installer runs it silently only when the runtime is missing.
const VC_REDIST_URL = process.env.VC_REDIST_URL ?? 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const vcTarget = join(staging, 'vcredist', 'vc_redist.x64.exe');
if (existsSync(vcTarget)) {
  console.log('\n▶ Visual C++ runtime already staged');
} else {
  step('Staging the Visual C++ runtime (vc_redist.x64.exe)');
  mkdirSync(cacheDir, { recursive: true });
  const cached = option('--vc-redist') ?? join(cacheDir, 'vc_redist.x64.exe');
  if (!existsSync(cached)) {
    console.log(`  downloading ${VC_REDIST_URL}`);
    const response = await fetch(VC_REDIST_URL);
    if (!response.ok) fail(`Download failed (${response.status}). Download vc_redist.x64.exe manually and pass --vc-redist <file>.`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cached, Buffer.from(await response.arrayBuffer()));
  }
  mkdirSync(join(staging, 'vcredist'), { recursive: true });
  cpSync(cached, vcTarget);
}

// ── Summary ───────────────────────────────────────────────────────────────
function sizeOf(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
}
step('Staged');
for (const part of ['api', 'web', 'pgsql', 'vcredist']) {
  console.log(`  ${part.padEnd(6)} ${(sizeOf(join(staging, part)) / 1024 / 1024).toFixed(1)} MB`);
}
