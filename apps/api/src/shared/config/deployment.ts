/**
 * Deployment mode (CLAUDE.md §2.4): the same API build runs either as the
 * multi-tenant cloud service or inside the Electron desktop app, where it
 * is spawned as a child process and serves exactly one fixed tenant.
 *
 * Every desktop-specific branch in the API reads its answer from here, so
 * "what changes on desktop" has one place to look instead of scattered
 * `process.env.DEPLOY_MODE` checks.
 */
export type DeployMode = 'cloud' | 'desktop';

export function getDeployMode(): DeployMode {
  return process.env.DEPLOY_MODE === 'desktop' ? 'desktop' : 'cloud';
}

export function isDesktopMode(): boolean {
  return getDeployMode() === 'desktop';
}

/** The single tenant schema a desktop install serves (fixed at install time). */
export const DEFAULT_DESKTOP_TENANT_SCHEMA = 'company';

export function getDesktopTenantSchema(): string {
  return process.env.DESKTOP_TENANT_SCHEMA?.trim() || DEFAULT_DESKTOP_TENANT_SCHEMA;
}

/**
 * Whether auth cookies get the `Secure` flag. Defaults to "production ⇒
 * secure", but the desktop app is served over plain http (localhost, and
 * optionally the shop's LAN), where a Secure cookie is silently dropped by
 * the browser and refresh would never work — COOKIE_SECURE overrides it.
 */
export function isCookieSecure(): boolean {
  const explicit = process.env.COOKIE_SECURE;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.NODE_ENV === 'production' && !isDesktopMode();
}

export type StorageDriver = 'minio' | 'local';

/** Desktop has no MinIO — files live on the local disk unless told otherwise. */
export function getStorageDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === 'local' || explicit === 'minio') return explicit;
  return isDesktopMode() ? 'local' : 'minio';
}
