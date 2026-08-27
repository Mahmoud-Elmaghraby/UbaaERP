import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { authHeader, loginAs } from './auth-helpers';
import {
  E2E_LIMITED_EMAIL,
  E2E_LIMITED_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
} from './global-setup';

/**
 * Backend RBAC enforcement, end to end (CLAUDE.md §2.8's spirit applied
 * to permissions rather than plan features, and the direct fix for the
 * "Settings had zero permission enforcement" gap this closure task
 * fixed — see CLAUDE.md §17's process and the wired-up
 * @UseGuards(JwtAuthGuard, PermissionsGuard) on every Settings
 * controller). The limited user (seeded in global-setup.ts) has a real
 * role with ZERO permissions — not just "fewer" permissions — so every
 * guarded route must refuse it.
 */
describe('PermissionsGuard enforcement (e2e, real HTTP)', () => {
  let app: INestApplication;
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('an Owner (settings.manage) can list branches', async () => {
    const owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await request(app.getHttpServer()).get('/branches').set(...authHeader(owner)).expect(200);
  });

  it('a user with zero permissions is refused on a settings.manage-gated route (403)', async () => {
    const limited = await loginAs(app, schema(), E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD);
    const response = await request(app.getHttpServer())
      .get('/branches')
      .set(...authHeader(limited))
      .expect(403);
    expect(response.body.message).toMatch(/settings\.manage/);
  });

  it('a user with zero permissions is refused on every other Settings-family route too', async () => {
    const limited = await loginAs(app, schema(), E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD);
    const server = app.getHttpServer();
    await request(server).get('/settings').set(...authHeader(limited)).expect(403);
    await request(server).get('/numbering-sequences').set(...authHeader(limited)).expect(403);
    await request(server).get('/document-templates').set(...authHeader(limited)).expect(403);
    await request(server).get('/tax-rules').set(...authHeader(limited)).expect(403);
    await request(server).get('/custom-field-definitions?entityType=branch').set(...authHeader(limited)).expect(403);
  });

  it('a user with zero permissions is refused on a users.manage-gated route (403)', async () => {
    const limited = await loginAs(app, schema(), E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD);
    await request(app.getHttpServer()).get('/users').set(...authHeader(limited)).expect(403);
  });

  it('a user with zero permissions is refused on a roles.manage-gated route (403)', async () => {
    const limited = await loginAs(app, schema(), E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD);
    await request(app.getHttpServer()).get('/roles').set(...authHeader(limited)).expect(403);
  });

  it('an Owner (all permissions) can reach every one of those same routes', async () => {
    const owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    const server = app.getHttpServer();
    await request(server).get('/settings').set(...authHeader(owner)).expect(200);
    await request(server).get('/users').set(...authHeader(owner)).expect(200);
    await request(server).get('/roles').set(...authHeader(owner)).expect(200);
  });

  it('any authenticated user (even with zero permissions) may still change their OWN password', async () => {
    // Uses a dedicated, throwaway user (created here) rather than the
    // shared E2E_LIMITED_* fixture user — this test mutates a password,
    // and the fixture user is reused read-only by every other test in
    // this e2e project (global-setup.ts runs once for the whole
    // project), so mutating it here would make other tests flaky
    // depending on run order/parallelism.
    const owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    const rolesResponse = await request(app.getHttpServer())
      .get('/roles')
      .set(...authHeader(owner))
      .expect(200);
    const ownerRoleId = rolesResponse.body.find((r: { name: string }) => r.name === 'Owner').id;

    const email = 'password-change-e2e@example.com';
    const originalPassword = 'OriginalPassword123';
    await request(app.getHttpServer())
      .post('/users')
      .set(...authHeader(owner))
      .send({ email, password: originalPassword, fullName: 'Password Change E2E User', roleId: ownerRoleId })
      .expect(201);

    // users/me/change-password has no @RequirePermissions — only
    // JwtAuthGuard at the class level (see users.controller.ts's comment)
    // — so a freshly created, otherwise-unprivileged user can still use it.
    const user = await loginAs(app, schema(), email, originalPassword);
    await request(app.getHttpServer())
      .post('/users/me/change-password')
      .set(...authHeader(user))
      .send({ currentPassword: originalPassword, newPassword: 'BrandNewPassword123' })
      .expect(201);

    // Prove it actually took effect: old password no longer logs in, new one does.
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email, password: originalPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-schema', schema())
      .send({ email, password: 'BrandNewPassword123' })
      .expect(201);
  });
});
