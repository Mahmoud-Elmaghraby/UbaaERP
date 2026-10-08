import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

/**
 * Machine-wide configuration of one desktop installation, written by the
 * installer (setup.ts) and read by the app (main.ts) on every start.
 *
 * Every secret is generated per machine at install time — the نبغة
 * installer shipped the same Postgres password ("123456"), DB password and
 * JWT secret to every customer; here nothing secret exists until install.
 *
 * Two files, two audiences:
 *  - config.json  — what the app needs at run time (readable by the
 *                   machine's users, since the app runs as the user).
 *  - admin.json   — the Postgres superuser password, needed only by the
 *                   installer (ACL'd to Administrators/SYSTEM on Windows).
 */
export interface DesktopConfig {
  version: 1;
  /** App version that last ran setup — tells an update from a fresh install. */
  installedVersion: string;
  database: {
    port: number;
    name: string;
    user: string;
    password: string;
  };
  api: {
    port: number;
    /** Owner's choice (tray menu): serve phones/PCs on the shop's network too. */
    lanAccess: boolean;
  };
  secrets: {
    jwtAccessSecret: string;
    storageSigningSecret: string;
    /** base64, 32 bytes — SecretsEncryptionService (e-invoice credentials). */
    secretsEncryptionKey: string;
  };
  backups: {
    /** Daily automatic pg_dump (CLAUDE.md §8: scheduled local backup). */
    keepDaily: number;
  };
}

export interface DesktopAdminSecrets {
  superuserPassword: string;
}

export const DEFAULT_DB_PORT = 54329;
export const DEFAULT_API_PORT = 47821;
export const DATABASE_NAME = 'erp_desktop';
export const DATABASE_USER = 'erp_app';

export function generateSecret(bytes = 32): string {
  // base64url: no characters that need escaping in a connection string or a shell.
  return randomBytes(bytes).toString('base64url');
}

export function createInitialConfig(options: { version: string; dbPort: number; apiPort: number }): DesktopConfig {
  return {
    version: 1,
    installedVersion: options.version,
    database: {
      port: options.dbPort,
      name: DATABASE_NAME,
      user: DATABASE_USER,
      password: generateSecret(24),
    },
    api: { port: options.apiPort, lanAccess: false },
    secrets: {
      jwtAccessSecret: generateSecret(48),
      storageSigningSecret: generateSecret(32),
      secretsEncryptionKey: randomBytes(32).toString('base64'),
    },
    backups: { keepDaily: 14 },
  };
}

export function databaseUrl(config: DesktopConfig): string {
  const { user, password, port, name } = config.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${name}`;
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Write-then-rename, so a crash mid-write never leaves a half-written config. */
export function writeJsonAtomic(path: string, value: unknown, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  // `mode` matters off Windows only (dev/tests); on Windows setup.ts sets ACLs.
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
  renameSync(temp, path);
}

export function configPath(dataRoot: string): string {
  return join(dataRoot, 'config.json');
}

export function adminSecretsPath(dataRoot: string): string {
  return join(dataRoot, 'admin', 'admin.json');
}

export function loadConfig(dataRoot: string): DesktopConfig | null {
  return readJson<DesktopConfig>(configPath(dataRoot));
}

export function saveConfig(dataRoot: string, config: DesktopConfig): void {
  writeJsonAtomic(configPath(dataRoot), config);
}

/** True when nothing is listening on 127.0.0.1:port. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/** `preferred` if free, otherwise the next free port above it (used once, at first install). */
export async function findFreePort(preferred: number, attempts = 50): Promise<number> {
  for (let port = preferred; port < preferred + attempts; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in ${preferred}–${preferred + attempts - 1}.`);
}
