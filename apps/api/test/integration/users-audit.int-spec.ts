import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import type { TenantConnectionManager } from '../../src/shared/tenancy/tenant-connection-manager';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { DomainAuditListener } from '../../src/modules/users-permissions/infrastructure/listeners/domain-audit.listener';
import { KyselyAuditLogRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-audit-log.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { KyselyRoleRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-role.repository';
import { KyselyRefreshTokenRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-refresh-token.repository';
import { UsersService } from '../../src/modules/users-permissions/application/services/users.service';
import { LoginLockoutService } from '../../src/modules/users-permissions/application/services/login-lockout.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Business events land in the audit log once; users carry their last sign-in; the last Owner is protected. */
describe('Audit trail and user management (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const auditLogs = new KyselyAuditLogRepository();
  const userRepo = new KyselyUserRepository();
  let listener: DomainAuditListener;
  let users: UsersService;

  beforeAll(() => {
    db = openIntegrationDb();
    listener = new DomainAuditListener(auditLogs, { getClient: () => db } as unknown as TenantConnectionManager);
    users = new UsersService(userRepo, new KyselyRoleRepository(), auditLogs, new KyselyRefreshTokenRepository());
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('records a business event once, with trimmed metadata, even when the Outbox redelivers it', async () => {
    const entityId = randomUUID();
    const payload = {
      schema: 'x',
      entityType: 'sales_invoice',
      entityId,
      action: 'posted',
      actorUserId: null,
      metadata: { invoiceNumber: 'INV-1', lines: [{ a: 1 }, { a: 2 }] },
      occurredAt: new Date('2026-11-07T10:00:00Z'),
    };
    await listener.handle(payload);
    await listener.handle(payload);
    await listener.handle({ not: 'a domain event' });

    const rows = await auditLogs.list(db, { entityType: 'sales_invoice', entityId }, 10, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'posted', metadata: { invoiceNumber: 'INV-1', linesCount: 2 } });
    expect(rows[0].metadata).not.toHaveProperty('lines');

    const byModule = await auditLogs.list(db, { entityTypes: ['sales_order', 'sales_invoice'], entityId }, 10, 0);
    expect(byModule).toHaveLength(1);
  });

  it('shows the last sign-in and refuses to demote the last active Owner', async () => {
    const owner = await userRepo.create(db, {
      email: `owner-${uniqueSuffix()}@x.test`,
      passwordHash: 'x',
      fullName: 'Owner',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });
    expect(owner.lastLoginAt).toBeNull();
    await auditLogs.record(db, { userId: owner.id, action: 'auth.login', entityType: 'user', entityId: owner.id });
    const reloaded = await userRepo.findById(db, owner.id);
    expect(reloaded?.lastLoginAt).toBeInstanceOf(Date);
    expect(reloaded?.twoFactorEnabled).toBe(false);

    // Deactivate every other Owner in this shared test schema so this one is the last.
    await db.updateTable('users').set({ is_active: false }).where('role_id', '=', OWNER_ROLE_ID).where('id', '!=', owner.id).execute();
    const role = await db.selectFrom('roles').select('id').where('id', '!=', OWNER_ROLE_ID).executeTakeFirst();
    const otherRoleId =
      role?.id ?? (await new KyselyRoleRepository().create(db, { name: `Role ${uniqueSuffix()}`, permissionKeys: [] })).id;
    await expect(users.update(db, owner.id, { roleId: otherRoleId }, owner.id)).rejects.toMatchObject({
      code: 'USER.LAST_OWNER',
    });
    await db.updateTable('users').set({ is_active: false }).where('id', '=', owner.id).execute();
  });

  it('replaced sales.manage / purchases.manage with granular keys, all granted to Owner (migration 0117)', async () => {
    const keys = (await db.selectFrom('permissions').select('key').execute()).map((r) => r.key);
    expect(keys).not.toContain('sales.manage');
    expect(keys).not.toContain('purchases.manage');
    const owner = await new KyselyRoleRepository().findById(db, OWNER_ROLE_ID);
    for (const key of ['sales.view', 'sales.create', 'sales.post', 'sales.cancel', 'sales.reports.view', 'sales.settings.manage', 'pos.use', 'purchases.view', 'purchases.post']) {
      expect(owner?.permissionKeys).toContain(key);
    }
  });

  it('locks an account after repeated wrong passwords, and an unlock resets it', async () => {
    const user = await userRepo.create(db, {
      email: `lock-${uniqueSuffix()}@x.test`,
      passwordHash: 'x',
      fullName: 'Lock',
      roleId: OWNER_ROLE_ID,
      isActive: false,
    });
    const lockout = new LoginLockoutService(auditLogs);
    for (let i = 0; i < 5; i += 1) {
      await auditLogs.record(db, {
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'wrong_password' },
      });
    }
    expect(await lockout.lockedUntil(db, user.id)).toBeInstanceOf(Date);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await auditLogs.record(db, { userId: null, action: 'user.unlocked', entityType: 'user', entityId: user.id });
    expect(await lockout.lockedUntil(db, user.id)).toBeNull();
  });
});

