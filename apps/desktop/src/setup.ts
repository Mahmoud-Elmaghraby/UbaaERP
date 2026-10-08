import { appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_API_PORT,
  DEFAULT_DB_PORT,
  adminSecretsPath,
  createInitialConfig,
  databaseUrl,
  findFreePort,
  generateSecret,
  loadConfig,
  readJson,
  saveConfig,
  writeJsonAtomic,
  type DesktopAdminSecrets,
  type DesktopConfig,
} from './shared/config';
import { DESKTOP_TENANT_SCHEMA } from './shared/api-env';
import { FIREWALL_RULE_NAME, WINDOWS_SERVICE_NAME, dataPaths, getDataRoot, resourcePaths, type DataPaths } from './shared/paths';
import { PgTools, SID, rotateBackups } from './shared/postgres';
import { IS_WINDOWS, nodeRuntimeEnv, run, runChecked } from './shared/process';

/**
 * Installer-side setup, run by the NSIS installer (installer/installer.nsh)
 * with the app's own executable as Node (ELECTRON_RUN_AS_NODE=1):
 *
 *   setup.js install   --version <v> --resources <dir> --app-exe <path>
 *   setup.js stop-db                      (before files are replaced on update)
 *   setup.js uninstall [--remove-data]
 *
 * Kept in JS instead of NSIS script on purpose: it is testable (the whole
 * install flow runs on Linux against real PostgreSQL binaries in CI/dev),
 * readable, and shares its config/Postgres code with the app itself.
 * Every step is idempotent — re-running "install" over an existing
 * installation is exactly what an update does.
 */

let logFile: string | null = null;

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  if (logFile) {
    try {
      appendFileSync(logFile, `${line}\n`);
    } catch {
      // logging must never break setup
    }
  }
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string | true> } {
  const [command = '', ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (!arg.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[arg.slice(2)] = next;
      i += 1;
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { command, flags };
}

/** Windows ACLs: users run the app (files/backups/logs/config); only the service and admins touch pgdata/admin. */
async function applyWindowsPermissions(paths: DataPaths): Promise<void> {
  if (!IS_WINDOWS) return;
  const grant = (path: string, ...rules: string[]) =>
    runChecked('icacls.exe', [path, ...rules.flatMap((rule) => ['/grant', rule]), '/T', '/C', '/Q']);

  await runChecked('icacls.exe', [paths.pgData, '/inheritance:r', '/Q']);
  await grant(paths.pgData, `${SID.networkService}:(OI)(CI)F`, `${SID.system}:(OI)(CI)F`, `${SID.administrators}:(OI)(CI)F`);

  const adminDir = join(paths.root, 'admin');
  await runChecked('icacls.exe', [adminDir, '/inheritance:r', '/Q']);
  await grant(adminDir, `${SID.system}:(OI)(CI)F`, `${SID.administrators}:(OI)(CI)F`);

  for (const dir of [paths.files, paths.backups, paths.logs]) {
    await grant(dir, `${SID.users}:(OI)(CI)M`);
  }
  // The app rewrites config.json (network-access toggle) as the logged-in user.
  await grant(join(paths.root, 'config.json'), `${SID.users}:M`);
}

async function ensureFirewallRule(appExe: string): Promise<void> {
  if (!IS_WINDOWS) return;
  // Private networks only — the shop's LAN, never public Wi-Fi. The app only
  // listens beyond 127.0.0.1 when the owner turns network access on.
  await run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE_NAME}`]);
  await runChecked('netsh.exe', [
    'advfirewall', 'firewall', 'add', 'rule', `name=${FIREWALL_RULE_NAME}`,
    'dir=in', 'action=allow', `program=${appExe}`, 'protocol=TCP', 'profile=private', 'enable=yes',
  ]);
}

export async function install(options: { version: string; resourcesRoot: string; appExe: string }): Promise<void> {
  const paths = dataPaths(getDataRoot());
  for (const dir of [paths.root, paths.files, paths.backups, paths.logs, join(paths.root, 'admin')]) {
    mkdirSync(dir, { recursive: true });
  }
  logFile = join(paths.logs, 'setup.log');
  const resources = resourcePaths(options.resourcesRoot);
  const pg = new PgTools(resources.pgBin);
  log(`install v${options.version} → data at ${paths.root}`);

  // 1. Configuration + secrets (kept as-is on update).
  let config = loadConfig(paths.root);
  const isUpdate = config !== null;
  if (!config) {
    config = createInitialConfig({
      version: options.version,
      dbPort: await findFreePort(DEFAULT_DB_PORT),
      apiPort: await findFreePort(DEFAULT_API_PORT),
    });
    saveConfig(paths.root, config);
    log(`new configuration: db port ${config.database.port}, app port ${config.api.port}`);
  } else {
    log(`existing installation v${config.installedVersion} — updating`);
  }
  let admin = readJson<DesktopAdminSecrets>(adminSecretsPath(paths.root));
  if (!admin) {
    if (PgTools.isClusterInitialized(paths.pgData)) {
      throw new Error('Database cluster exists but its admin password file is missing — restore admin.json from a backup.');
    }
    admin = { superuserPassword: generateSecret(24) };
    writeJsonAtomic(adminSecretsPath(paths.root), admin, 0o600);
  }

  // 2. PostgreSQL cluster + service.
  if (!PgTools.isClusterInitialized(paths.pgData)) {
    log('initializing database cluster');
    await pg.initCluster(paths.pgData, admin.superuserPassword, join(paths.root, 'admin'));
  }
  PgTools.writeClusterSettings(paths.pgData, config.database.port);
  await applyWindowsPermissions(paths);
  if (IS_WINDOWS && !(await pg.serviceExists(WINDOWS_SERVICE_NAME))) {
    log(`registering Windows service ${WINDOWS_SERVICE_NAME}`);
    await pg.registerService(WINDOWS_SERVICE_NAME, paths.pgData);
  }
  log('starting database');
  await pg.start({ serviceName: WINDOWS_SERVICE_NAME, pgData: paths.pgData, logFile: join(paths.logs, 'postgres.log') });
  await pg.waitReady(config.database.port, 90_000);

  // 3. App role + database.
  await pg.ensureAppDatabase(config.database.port, admin.superuserPassword, config.database);
  const appConn = { port: config.database.port, user: config.database.user, password: config.database.password, database: config.database.name };

  // 4. Update: back up before any migration touches the data.
  if (isUpdate && (await pg.hasAnyTenantData(appConn))) {
    const file = await pg.dump(appConn, paths.backups, 'pre-update');
    rotateBackups(paths.backups, 'pre-update', 5);
    log(`pre-update backup: ${file}`);
  }

  // 5. Schema: public migrations, plan, the one tenant (same code as the cloud).
  await runDesktopSetup(config, resources.desktopSetupEntry, resources.api);

  // 6. Network access rule (inactive until the owner turns LAN access on).
  await ensureFirewallRule(options.appExe);

  config.installedVersion = options.version;
  saveConfig(paths.root, config);
  log('install complete');
}

export async function runDesktopSetup(config: DesktopConfig, entry: string, cwd: string): Promise<void> {
  log('applying database migrations');
  const result = await run(process.execPath, [entry], {
    cwd,
    env: nodeRuntimeEnv({
      DOTENV_CONFIG_PATH: '__none__',
      DATABASE_URL: databaseUrl(config),
      DESKTOP_TENANT_SCHEMA,
    }),
  });
  for (const line of `${result.stdout}${result.stderr}`.split('\n').filter(Boolean)) log(`  ${line}`);
  if (result.code !== 0) throw new Error(`Database migrations failed (exit ${result.code}).`);
}

export async function stopDatabase(resourcesRoot: string): Promise<void> {
  const paths = dataPaths(getDataRoot());
  if (!existsSync(paths.pgData)) return;
  const pg = new PgTools(resourcePaths(resourcesRoot).pgBin);
  await pg.stop({ serviceName: WINDOWS_SERVICE_NAME, pgData: paths.pgData });
}

export async function uninstall(options: { resourcesRoot: string; removeData: boolean }): Promise<void> {
  const paths = dataPaths(getDataRoot());
  const pg = new PgTools(resourcePaths(options.resourcesRoot).pgBin);
  if (IS_WINDOWS) {
    await pg.unregisterService(WINDOWS_SERVICE_NAME);
    await run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE_NAME}`]);
  } else {
    await pg.stop({ serviceName: WINDOWS_SERVICE_NAME, pgData: paths.pgData });
  }
  // Data is kept unless the person uninstalling explicitly chose to remove it.
  if (options.removeData) rmSync(paths.root, { recursive: true, force: true });
}

if (require.main === module) {
  void (async () => {
    const { command, flags } = parseArgs(process.argv.slice(2));
    const resourcesRoot = typeof flags.resources === 'string' ? flags.resources : join(__dirname, '..');
    try {
      if (command === 'install') {
        await install({
          version: typeof flags.version === 'string' ? flags.version : '0.0.0',
          resourcesRoot,
          appExe: typeof flags['app-exe'] === 'string' ? flags['app-exe'] : process.execPath,
        });
      } else if (command === 'stop-db') {
        await stopDatabase(resourcesRoot);
      } else if (command === 'uninstall') {
        await uninstall({ resourcesRoot, removeData: flags['remove-data'] === true });
      } else {
        console.error('Usage: setup.js install|stop-db|uninstall [--resources <dir>] [--version <v>] [--app-exe <path>] [--remove-data]');
        process.exitCode = 2;
        return;
      }
    } catch (err) {
      log(`FAILED: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  })();
}
