import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { extractRefreshTokenCookie } from './auth-helpers';
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

  it('logs in with valid credentials and returns a usable token pair, with the refresh token only as an httpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.email).toBe(E2E_OWNER_EMAIL);
    // The refresh token must never appear in the JSON body (Task 9) — it's
    // transported exclusively via the httpOnly cookie asserted below.
    expect(response.body).not.toHaveProperty('refreshToken');

    const cookie = extractRefreshTokenCookie(response.headers['set-cookie']);
    expect(cookie).toEqual(expect.any(String));
    expect(response.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
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
    // request.agent() carries the httpOnly cookie automatically across
    // calls, exactly like a real browser would — the refresh token is
    // never read from or written to the request/response body.
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);
    const oldCookie = extractRefreshTokenCookie(login.headers['set-cookie']);

    const refreshed = await agent.post('/auth/refresh').set('x-tenant-schema', schema()).expect(201);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const newCookie = extractRefreshTokenCookie(refreshed.headers['set-cookie']);
    expect(newCookie).not.toBe(oldCookie);

    // Rotation: the old refresh token must be dead now — replayed
    // explicitly via a plain (non-agent) request, since the agent's own
    // cookie jar has already moved on to the new cookie above.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .set('Cookie', `refresh_token=${oldCookie}`)
      .expect(401);
  });

  it('rejects refreshing with a garbage/unknown token', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .set('Cookie', 'refresh_token=not-a-real-token')
      .expect(401);
  });

  it('rejects refreshing with no cookie at all', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').set('x-tenant-schema', schema()).expect(401);
  });

  it('logout revokes the refresh token — it can no longer be used to refresh afterwards', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD })
      .expect(201);
    const cookie = extractRefreshTokenCookie(login.headers['set-cookie']);

    await agent.post('/auth/logout').set('x-tenant-schema', schema()).expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-tenant-schema', schema())
      .set('Cookie', `refresh_token=${cookie}`)
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
