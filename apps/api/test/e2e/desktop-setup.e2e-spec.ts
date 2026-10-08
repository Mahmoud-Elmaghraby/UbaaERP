import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { createTestTenant, dropTestTenant, type ProvisionedTestTenant } from '../support/test-tenant';

/**
 * Desktop first run (DesktopSetupService): a freshly installed copy has a
 * provisioned tenant but no user; the first person creates the Owner, once.
 */
describe('Desktop first-run setup (e2e)', () => {
  let app: INestApplication;
  let tenant: ProvisionedTestTenant;
  const saved = { mode: process.env.DEPLOY_MODE, schema: process.env.DESKTOP_TENANT_SCHEMA };
  const owner = { companyName: 'شركة الاختبار', ownerFullName: 'المدير', email: 'Owner@Desktop.test', password: 'Desk1Passw0rd' };

  beforeAll(async () => {
    tenant = await createTestTenant('desktop'); // no owner — like the installer
    app = await createE2eApp();
  });

  afterAll(async () => {
    process.env.DEPLOY_MODE = saved.mode;
    process.env.DESKTOP_TENANT_SCHEMA = saved.schema;
    await app.close();
    await dropTestTenant(tenant);
  });

  it('cloud mode: /runtime says cloud and setup does not exist', async () => {
    delete process.env.DEPLOY_MODE;
    await request(app.getHttpServer()).get('/runtime').expect(200, { mode: 'cloud' });
    await request(app.getHttpServer()).post('/desktop/setup').send(owner).expect(404);
  });

  it('desktop mode: needs setup → creates the Owner once → can log in', async () => {
    process.env.DEPLOY_MODE = 'desktop';
    process.env.DESKTOP_TENANT_SCHEMA = tenant.schemaName;
    const server = app.getHttpServer();

    const before = await request(server).get('/runtime').expect(200);
    expect(before.body).toMatchObject({ mode: 'desktop', tenantSchema: tenant.schemaName, needsSetup: true });

    await request(server).post('/desktop/setup').send({ ...owner, password: 'weak' }).expect(400);
    await request(server).post('/desktop/setup').send(owner).expect(201, { email: 'owner@desktop.test' });

    const second = await request(server).post('/desktop/setup').send({ ...owner, email: 'intruder@x.test' }).expect(409);
    expect(second.body.code).toBe('DESKTOP.ALREADY_SET_UP');

    const after = await request(server).get('/runtime').expect(200);
    expect(after.body.needsSetup).toBe(false);

    const login = await request(server)
      .post('/auth/login')
      .set('x-tenant-schema', tenant.schemaName)
      .send({ email: owner.email, password: owner.password })
      .expect(201);
    expect(login.body.user.email).toBe('owner@desktop.test');

    const settings = await request(server).get('/settings').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(JSON.stringify(settings.body)).toContain('شركة الاختبار');
  });
});
