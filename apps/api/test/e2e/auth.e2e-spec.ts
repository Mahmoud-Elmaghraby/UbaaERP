import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';

describe('Auth flow (e2e, real HTTP against a real Nest app)', () => {
  let app: INestApplication;
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with valid credentials and returns a usable token pair', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user.email).toBe(E2E_OWNER_EMAIL);
  });

  it('rejects a wrong password with 401, not a stack trace or a 500', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: 'definitely-wrong' })
      .expect(401);
  });

  it('rejects an unknown email with the same generic 401 (no user enumeration)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: 'nobody@example.com', password: 'whatever12' })
      .expect(401);
    expect(response.body.message).toMatch(/invalid email or password/i);
  });

  it('rejects a login request missing the x-tenant-schema header with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(400);
  });

  it('rejects a malformed body (Zod validation) with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
  });

  it('refreshes a valid refresh token for a new, working token pair, and rotates it (old one stops working)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);
    const oldRefreshToken = login.body.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .send({ refreshToken: oldRefreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(oldRefreshToken);

    // Rotation: the old refresh token must be dead now.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('rejects refreshing with a garbage/unknown token', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });

  it('logout revokes the refresh token — it can no longer be used to refresh afterwards', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('x-tenant-schema', schema())
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('rejects any protected route with no Authorization header at all (401)', async () => {
    await request(app.getHttpServer()).get('/branches').expect(401);
  });

  it('rejects a protected route with a garbage bearer token (401)', async () => {
    await request(app.getHttpServer())
      .get('/branches')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });
});
