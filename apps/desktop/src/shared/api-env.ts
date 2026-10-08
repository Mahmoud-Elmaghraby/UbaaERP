import { databaseUrl, type DesktopConfig } from './config';
import type { DataPaths, ResourcePaths } from './paths';

export const DESKTOP_TENANT_SCHEMA = 'company';

/**
 * The complete environment the API child process runs with on desktop —
 * built from the per-machine config, never from a .env file (DOTENV is
 * pointed at nothing so a stray .env can't leak in).
 */
export function buildApiEnv(options: {
  config: DesktopConfig;
  data: DataPaths;
  resources: ResourcePaths;
  appVersion: string;
}): NodeJS.ProcessEnv {
  const { config, data, resources, appVersion } = options;
  const port = config.api.port;
  return {
    DOTENV_CONFIG_PATH: '__none__',
    NODE_ENV: 'production',
    DEPLOY_MODE: 'desktop',
    APP_VERSION: appVersion,
    DESKTOP_TENANT_SCHEMA,
    DATABASE_URL: databaseUrl(config),
    PORT: String(port),
    HOST: config.api.lanAccess ? '0.0.0.0' : '127.0.0.1',
    CORS_ORIGIN: `http://127.0.0.1:${port},http://localhost:${port}`,
    COOKIE_SECURE: 'false',
    WEB_DIST_PATH: resources.web,
    JWT_ACCESS_SECRET: config.secrets.jwtAccessSecret,
    SECRETS_ENCRYPTION_KEY: config.secrets.secretsEncryptionKey,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_PATH: data.files,
    STORAGE_SIGNING_SECRET: config.secrets.storageSigningSecret,
  };
}

export function apiBaseUrl(config: DesktopConfig): string {
  return `http://127.0.0.1:${config.api.port}`;
}
