import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IS_WINDOWS, run, runChecked, sleep } from './process';

/**
 * Everything the desktop build does with its private PostgreSQL — through
 * the bundled command-line tools only (initdb, pg_ctl, pg_isready, psql,
 * pg_dump), so neither the installer nor the app needs a Postgres driver.
 *
 * The cluster is the app's own: its own data directory, its own port
 * (not 5432), its own Windows service — it never touches, and is never
 * confused with, a PostgreSQL the customer may already have installed
 * (the نبغة installer had to detect one and ask for its password).
 */
export const SUPERUSER = 'postgres';

/** Well-known SIDs — language-independent, unlike "NT AUTHORITY\NetworkService". */
export const SID = {
  networkService: '*S-1-5-20',
  system: '*S-1-5-18',
  administrators: '*S-1-5-32-544',
  users: '*S-1-5-32-545',
} as const;

export class PgTools {
  constructor(private readonly binDir: string) {}

  exe(name: string): string {
    return join(this.binDir, IS_WINDOWS ? `${name}.exe` : name);
  }

  static isClusterInitialized(pgData: string): boolean {
    return existsSync(join(pgData, 'PG_VERSION'));
  }

  async initCluster(pgData: string, superuserPassword: string, scratchDir: string): Promise<void> {
    mkdirSync(scratchDir, { recursive: true });
    const pwFile = join(scratchDir, `.pw-${process.pid}`);
    writeFileSync(pwFile, `${superuserPassword}\n`, { mode: 0o600 });
    try {
      await runChecked(this.exe('initdb'), [
        '-D', pgData,
        '-U', SUPERUSER,
        '--pwfile', pwFile,
        '-A', 'scram-sha-256',
        '-E', 'UTF8',
        // "C": identical, predictable behavior on every Windows locale (the
        // OS locale names differ by language/edition and break initdb).
        '--locale', 'C',
      ]);
    } finally {
      rmSync(pwFile, { force: true });
    }
  }

  /**
   * Our settings live in their own file, included once from postgresql.conf —
   * re-running setup (every update) rewrites only this file.
   */
  static writeClusterSettings(pgData: string, port: number): void {
    const settingsFile = 'erp-desktop.conf';
    writeFileSync(
      join(pgData, settingsFile),
      [
        '# Managed by the ERP Platform installer — rewritten on every update.',
        "listen_addresses = '127.0.0.1'",
        `port = ${port}`,
        'max_connections = 60',
        "timezone = 'Africa/Cairo'",
        'logging_collector = on',
        "log_directory = 'log'",
        'log_rotation_age = 1d',
        'log_truncate_on_rotation = on',
        "log_filename = 'postgresql-%a.log'",
        '',
      ].join('\n'),
    );
    const mainConf = join(pgData, 'postgresql.conf');
    const include = `include_if_exists = '${settingsFile}'`;
    const current = readFileSync(mainConf, 'utf8');
    if (!current.includes(include)) writeFileSync(mainConf, `${current}\n${include}\n`);
  }

  async isReady(port: number): Promise<boolean> {
    const result = await run(this.exe('pg_isready'), ['-h', '127.0.0.1', '-p', String(port), '-t', '2']);
    return result.code === 0;
  }

  async waitReady(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isReady(port)) return;
      await sleep(1_000);
    }
    throw new Error(`PostgreSQL on port ${port} did not become ready within ${Math.round(timeoutMs / 1000)}s.`);
  }

  // ── Running the server ────────────────────────────────────────────────
  // Windows: a real auto-start service (CLAUDE.md §2.4/§6), running as
  // NetworkService. Elsewhere (development/tests only): plain pg_ctl.

  async serviceExists(serviceName: string): Promise<boolean> {
    if (!IS_WINDOWS) return false;
    const result = await run('sc.exe', ['query', serviceName]);
    return result.code === 0;
  }

  async registerService(serviceName: string, pgData: string): Promise<void> {
    await runChecked(this.exe('pg_ctl'), [
      'register', '-N', serviceName, '-D', pgData, '-S', 'auto', '-U', 'NT AUTHORITY\\NetworkService', '-w',
    ]);
    await run('sc.exe', ['description', serviceName, 'PostgreSQL database for the ERP Platform desktop app.']);
    // Restart automatically if it ever crashes.
    await run('sc.exe', ['failure', serviceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/10000/restart/30000']);
  }

  async unregisterService(serviceName: string): Promise<void> {
    if (!(await this.serviceExists(serviceName))) return;
    await this.stop({ serviceName, pgData: '' });
    await run(this.exe('pg_ctl'), ['unregister', '-N', serviceName]);
  }

  async start(target: { serviceName: string; pgData: string; logFile: string }): Promise<void> {
    if (IS_WINDOWS) {
      const result = await run('net.exe', ['start', target.serviceName]);
      // 2 = "already started" — fine.
      if (result.code !== 0 && !/2182|already been started/i.test(result.stdout + result.stderr)) {
        throw new Error(`Could not start service ${target.serviceName}: ${(result.stderr || result.stdout).trim()}`);
      }
      return;
    }
    if (await this.isRunningLocally(target.pgData)) return;
    await runChecked(this.exe('pg_ctl'), ['start', '-D', target.pgData, '-l', target.logFile, '-w', '-t', '60']);
  }

  async stop(target: { serviceName: string; pgData: string }): Promise<void> {
    if (IS_WINDOWS) {
      if (!(await this.serviceExists(target.serviceName))) return;
      await run('net.exe', ['stop', target.serviceName]); // not running → non-zero, ignored
      return;
    }
    if (target.pgData && (await this.isRunningLocally(target.pgData))) {
      await runChecked(this.exe('pg_ctl'), ['stop', '-D', target.pgData, '-m', 'fast', '-w']);
    }
  }

  private async isRunningLocally(pgData: string): Promise<boolean> {
    return (await run(this.exe('pg_ctl'), ['status', '-D', pgData])).code === 0;
  }

  // ── SQL ───────────────────────────────────────────────────────────────

  async psql(conn: { port: number; user: string; password: string; database: string }, sql: string): Promise<string> {
    const result = await runChecked(
      this.exe('psql'),
      ['-h', '127.0.0.1', '-p', String(conn.port), '-U', conn.user, '-d', conn.database, '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', sql],
      { env: { ...process.env, PGPASSWORD: conn.password, PGCONNECT_TIMEOUT: '10' } },
    );
    return result.stdout.trim();
  }

  /** Creates (or re-passwords) the app's login role and its database. Idempotent. */
  async ensureAppDatabase(
    port: number,
    superuserPassword: string,
    app: { name: string; user: string; password: string },
  ): Promise<void> {
    const su = { port, user: SUPERUSER, password: superuserPassword, database: 'postgres' };
    const role = quoteIdent(app.user);
    const exists = await this.psql(su, `SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(app.user)}`);
    const verb = exists === '1' ? 'ALTER' : 'CREATE';
    await this.psql(su, `${verb} ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD ${quoteLiteral(app.password)}`);
    const dbExists = await this.psql(su, `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(app.name)}`);
    if (dbExists !== '1') {
      await this.psql(su, `CREATE DATABASE ${quoteIdent(app.name)} OWNER ${role} ENCODING 'UTF8' TEMPLATE template0`);
    }
    await this.psql(su, `REVOKE ALL ON DATABASE ${quoteIdent(app.name)} FROM PUBLIC`);
  }

  async hasAnyTenantData(conn: { port: number; user: string; password: string; database: string }): Promise<boolean> {
    const result = await this.psql(conn, "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants'");
    return result === '1';
  }

  /** Custom-format dump (restorable with pg_restore). Returns the file written. */
  async dump(
    conn: { port: number; user: string; password: string; database: string },
    backupsDir: string,
    label: string,
  ): Promise<string> {
    mkdirSync(backupsDir, { recursive: true });
    const file = join(backupsDir, `${label}-${timestamp()}.dump`);
    await runChecked(
      this.exe('pg_dump'),
      ['-h', '127.0.0.1', '-p', String(conn.port), '-U', conn.user, '-d', conn.database, '-Fc', '-f', file],
      { env: { ...process.env, PGPASSWORD: conn.password } },
    );
    return file;
  }
}

/** Keeps the newest `keep` files starting with `prefix`; deletes the rest. Returns what it deleted. */
export function rotateBackups(backupsDir: string, prefix: string, keep: number): string[] {
  if (!existsSync(backupsDir)) return [];
  const files = readdirSync(backupsDir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.dump'))
    .map((name) => ({ name, mtime: statSync(join(backupsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const removed = files.slice(keep).map((file) => join(backupsDir, file.name));
  for (const path of removed) rmSync(path, { force: true });
  return removed;
}

export function latestBackupTime(backupsDir: string, prefix: string): number | null {
  if (!existsSync(backupsDir)) return null;
  const times = readdirSync(backupsDir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.dump'))
    .map((name) => statSync(join(backupsDir, name)).mtimeMs);
  return times.length ? Math.max(...times) : null;
}

export function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
