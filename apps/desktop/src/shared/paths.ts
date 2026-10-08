import { join } from 'node:path';

/**
 * Where an installation keeps its machine-wide state. Program files are
 * replaced on every update; everything that must survive one lives here:
 *
 *   <dataRoot>/config.json        app configuration + per-machine secrets
 *   <dataRoot>/admin/admin.json   Postgres superuser password (installer only)
 *   <dataRoot>/pgdata/            the PostgreSQL cluster
 *   <dataRoot>/files/             uploaded files (local object storage)
 *   <dataRoot>/backups/           daily + pre-update pg_dump files
 *   <dataRoot>/logs/              setup / api / postgres logs
 */
export const PRODUCT_DIR_NAME = 'ERP Platform';
export const WINDOWS_SERVICE_NAME = 'ERPPlatformDB';
export const FIREWALL_RULE_NAME = 'ERP Platform (LAN)';

export function getDataRoot(): string {
  // Override for development/tests on any OS.
  if (process.env.ERP_DESKTOP_DATA_DIR) return process.env.ERP_DESKTOP_DATA_DIR;
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';
  return join(programData, PRODUCT_DIR_NAME);
}

export interface DataPaths {
  root: string;
  pgData: string;
  files: string;
  backups: string;
  logs: string;
}

export function dataPaths(root: string = getDataRoot()): DataPaths {
  return {
    root,
    pgData: join(root, 'pgdata'),
    files: join(root, 'files'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
  };
}

/**
 * Resources shipped with the app (electron-builder `extraResources`):
 *   <resources>/api     the NestJS API (dist + production node_modules)
 *   <resources>/web     the built web app
 *   <resources>/pgsql   PostgreSQL binaries (bin/, lib/, share/)
 *   <resources>/setup   this package's compiled JS (run by the installer)
 */
export interface ResourcePaths {
  api: string;
  apiEntry: string;
  desktopSetupEntry: string;
  web: string;
  pgBin: string;
}

export function resourcePaths(resourcesRoot: string): ResourcePaths {
  const api = join(resourcesRoot, 'api');
  return {
    api,
    apiEntry: join(api, 'dist', 'main.js'),
    desktopSetupEntry: join(api, 'dist', 'database', 'desktop', 'desktop-setup.command.js'),
    web: join(resourcesRoot, 'web'),
    pgBin: process.env.ERP_DESKTOP_PG_BIN ?? join(resourcesRoot, 'pgsql', 'bin'),
  };
}
