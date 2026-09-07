import { validateEnv } from './env.validation';

const REQUIRED_BASE = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('validateEnv()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('passes with only the required vars set', () => {
    process.env = { ...REQUIRED_BASE } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws a single aggregated error listing every problem when required vars are missing', () => {
    process.env = {} as NodeJS.ProcessEnv;
    try {
      validateEnv();
      fail('expected validateEnv() to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    process.env = { ...REQUIRED_BASE, DATABASE_URL: 'mysql://localhost/db' } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('rejects a JWT_ACCESS_SECRET shorter than 16 characters', () => {
    process.env = { ...REQUIRED_BASE, JWT_ACCESS_SECRET: 'short' } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a non-numeric PORT', () => {
    process.env = { ...REQUIRED_BASE, PORT: 'not-a-number' } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).toThrow(/PORT/);
  });

  it('rejects a non-numeric JWT_REFRESH_TTL_DAYS', () => {
    process.env = { ...REQUIRED_BASE, JWT_REFRESH_TTL_DAYS: 'thirty' } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).toThrow(/JWT_REFRESH_TTL_DAYS/);
  });

  it('rejects an invalid NODE_ENV value', () => {
    process.env = { ...REQUIRED_BASE, NODE_ENV: 'staging' } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).toThrow(/NODE_ENV/);
  });

  it('accepts a fully-populated, valid environment', () => {
    process.env = {
      ...REQUIRED_BASE,
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL_DAYS: '30',
      PORT: '3000',
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      SECRETS_ENCRYPTION_KEY: 'irrelevant-format-checked-elsewhere',
    } as NodeJS.ProcessEnv;
    expect(() => validateEnv()).not.toThrow();
  });
});
