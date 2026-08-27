import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { authHeader, loginAs } from './auth-helpers';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';

/**
 * Critical-flow e2e coverage (CLAUDE.md §8: "critical business flows
 * only" for e2e — exhaustive per-field/per-error-path coverage already
 * lives in the unit tests (application layer) and integration tests
 * (repositories against real Postgres); this proves the real HTTP
 * wiring — routing, guards, Zod validation, DomainExceptionFilter — for
 * one representative round trip per module.
 */
describe('Settings & Users CRUD (e2e, real HTTP)', () => {
  let app: INestApplication;
  let ownerAuth: [string, string];
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;

  beforeAll(async () => {
    app = await createE2eApp();
    const owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    ownerAuth = authHeader(owner);
  });

  afterAll(async () => {
    await app.close();
  });

  it('branches: full create -> list -> get -> update -> delete -> 404 round trip', async () => {
    const server = app.getHttpServer();
    const code = `E2E-${randomUUID().slice(0, 8)}`;

    const created = await request(server)
      .post('/branches')
      .set(...ownerAuth)
      .send({ name: 'E2E Branch', code })
      .expect(201);
    const branchId = created.body.id;
    expect(created.body.isActive).toBe(true);

    const list = await request(server).get('/branches').set(...ownerAuth).expect(200);
    expect(list.body.map((b: { id: string }) => b.id)).toContain(branchId);

    const fetched = await request(server).get(`/branches/${branchId}`).set(...ownerAuth).expect(200);
    expect(fetched.body.code).toBe(code);

    const updated = await request(server)
      .patch(`/branches/${branchId}`)
      .set(...ownerAuth)
      .send({ name: 'E2E Branch Renamed' })
      .expect(200);
    expect(updated.body.name).toBe('E2E Branch Renamed');

    await request(server).delete(`/branches/${branchId}`).set(...ownerAuth).expect(204);
    await request(server).get(`/branches/${branchId}`).set(...ownerAuth).expect(404);
  });

  it('branches: a duplicate code surfaces as a real HTTP 409, via DomainExceptionFilter', async () => {
    const server = app.getHttpServer();
    const code = `E2E-DUP-${randomUUID().slice(0, 8)}`;
    await request(server).post('/branches').set(...ownerAuth).send({ name: 'First', code }).expect(201);

    await request(server).post('/branches').set(...ownerAuth).send({ name: 'Second', code }).expect(409);
  });

  it('branches: an invalid body is rejected with 400 before it ever reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/branches')
      .set(...ownerAuth)
      .send({ name: '' /* missing required `code` entirely */ })
      .expect(400);
  });

  it('users + roles + branch-access + manager: a full onboarding flow through real HTTP', async () => {
    const server = app.getHttpServer();

    // A dedicated role for this test, scoped to just settings.manage, so
    // this flow also incidentally proves role -> permission wiring works
    // through the real roles endpoint (not just the roles unit tests).
    const role = await request(server)
      .post('/roles')
      .set(...ownerAuth)
      .send({ name: `E2E Role ${randomUUID().slice(0, 8)}`, permissionKeys: ['settings.manage'] })
      .expect(201);

    const branch = await request(server)
      .post('/branches')
      .set(...ownerAuth)
      .send({ name: 'Onboarding Branch', code: `ONB-${randomUUID().slice(0, 8)}` })
      .expect(201);

    const manager = await request(server)
      .post('/users')
      .set(...ownerAuth)
      .send({
        email: `manager-${randomUUID().slice(0, 8)}@example.com`,
        password: 'ManagerPassword123',
        fullName: 'E2E Manager',
        roleId: role.body.id,
      })
      .expect(201);

    const employee = await request(server)
      .post('/users')
      .set(...ownerAuth)
      .send({
        email: `employee-${randomUUID().slice(0, 8)}@example.com`,
        password: 'EmployeePassword123',
        fullName: 'E2E Employee',
        roleId: role.body.id,
      })
      .expect(201);

    await request(server)
      .patch(`/users/${employee.body.id}/branch-access`)
      .set(...ownerAuth)
      .send({ branchIds: [branch.body.id] })
      .expect(200);
    const branchAccess = await request(server)
      .get(`/users/${employee.body.id}/branch-access`)
      .set(...ownerAuth)
      .expect(200);
    expect(branchAccess.body.branchIds).toEqual([branch.body.id]);

    await request(server)
      .patch(`/users/${employee.body.id}/manager`)
      .set(...ownerAuth)
      .send({ managerId: manager.body.id })
      .expect(200);
    const managerLink = await request(server)
      .get(`/users/${employee.body.id}/manager`)
      .set(...ownerAuth)
      .expect(200);
    expect(managerLink.body.managerId).toBe(manager.body.id);

    // The audit trail this whole flow should have produced is itself a
    // critical, user-facing feature (the audit-log screen) — spot-check
    // that both actions were recorded. The audit-logs endpoint only
    // filters by userId/entityType/action/from/to (see
    // audit-logs.controller.ts) — no entityId filter — so this checks
    // presence within the broader entityType:'user' result set rather
    // than assuming an exact match.
    const auditLogs = await request(server)
      .get('/audit-logs')
      .query({ entityType: 'user', limit: '200' })
      .set(...ownerAuth)
      .expect(200);
    const entriesForEmployee = auditLogs.body.filter(
      (entry: { entityId: string | null }) => entry.entityId === employee.body.id,
    );
    const actions = entriesForEmployee.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['user.branch_access_set', 'user.manager_set']));
  });

  it('roles: deleting a role that is still assigned to a user surfaces as a real HTTP 409', async () => {
    const server = app.getHttpServer();
    const role = await request(server)
      .post('/roles')
      .set(...ownerAuth)
      .send({ name: `E2E Referenced Role ${randomUUID().slice(0, 8)}`, permissionKeys: [] })
      .expect(201);
    await request(server)
      .post('/users')
      .set(...ownerAuth)
      .send({
        email: `referencing-${randomUUID().slice(0, 8)}@example.com`,
        password: 'ReferencedPassword123',
        fullName: 'References The Role',
        roleId: role.body.id,
      })
      .expect(201);

    await request(server).delete(`/roles/${role.body.id}`).set(...ownerAuth).expect(409);
  });

  it("a user cannot deactivate their own account through the API (self-deactivation guard)", async () => {
    const server = app.getHttpServer();
    const login = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    const response = await request(server)
      .patch(`/users/${login.userId}`)
      .set(...authHeader(login))
      .send({ isActive: false })
      .expect(409);
    expect(response.body.message).toMatch(/cannot deactivate your own account/i);
  });
});
