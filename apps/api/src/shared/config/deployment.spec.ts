import { getDesktopTenantSchema, getStorageDriver, isCookieSecure, isDesktopMode } from './deployment';

describe('deployment mode', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to the cloud: MinIO, secure cookies in production', () => {
    delete process.env.DEPLOY_MODE;
    delete process.env.STORAGE_DRIVER;
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = 'production';
    expect(isDesktopMode()).toBe(false);
    expect(getStorageDriver()).toBe('minio');
    expect(isCookieSecure()).toBe(true);
  });

  it('desktop: local files, http-safe cookies, one fixed tenant', () => {
    process.env.DEPLOY_MODE = 'desktop';
    process.env.NODE_ENV = 'production';
    delete process.env.STORAGE_DRIVER;
    delete process.env.COOKIE_SECURE;
    delete process.env.DESKTOP_TENANT_SCHEMA;
    expect(isDesktopMode()).toBe(true);
    expect(getStorageDriver()).toBe('local');
    expect(isCookieSecure()).toBe(false);
    expect(getDesktopTenantSchema()).toBe('company');
  });

  it('explicit settings win', () => {
    process.env.DEPLOY_MODE = 'desktop';
    process.env.STORAGE_DRIVER = 'minio';
    process.env.COOKIE_SECURE = 'true';
    process.env.DESKTOP_TENANT_SCHEMA = 'shop_one';
    expect(getStorageDriver()).toBe('minio');
    expect(isCookieSecure()).toBe(true);
    expect(getDesktopTenantSchema()).toBe('shop_one');
  });
});
