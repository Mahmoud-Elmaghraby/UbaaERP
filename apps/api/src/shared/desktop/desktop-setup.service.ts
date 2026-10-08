import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { DesktopSetupInput, RuntimeInfoDto } from '@erp-platform/contracts';
import { ConflictError, NotFoundError } from '../errors/domain-errors';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { getDesktopTenantSchema, isDesktopMode } from '../config/deployment';
import { insertOwnerUser } from '../../database/tenant/owner-seed';

/** Arbitrary but fixed key: serializes concurrent first-run setups. */
const SETUP_LOCK_KEY = 7_311_002;

/**
 * Desktop runtime info + first-run setup (CLAUDE.md §2.3/§2.4: one fixed
 * tenant per install). The installer provisions the tenant schema but
 * deliberately creates no user — no password is baked into the installer
 * (the نبغة installer shipped one hard-coded admin password to every
 * customer). The first person to open the app creates the Owner here.
 */
@Injectable()
export class DesktopSetupService {
  constructor(private readonly connections: TenantConnectionManager) {}

  async getRuntimeInfo(): Promise<RuntimeInfoDto> {
    if (!isDesktopMode()) return { mode: 'cloud' };
    const tenantSchema = getDesktopTenantSchema();
    return {
      mode: 'desktop',
      tenantSchema,
      needsSetup: (await this.countUsers(tenantSchema)) === 0,
      appVersion: process.env.APP_VERSION ?? null,
    };
  }

  async completeSetup(input: DesktopSetupInput): Promise<{ email: string }> {
    if (!isDesktopMode()) {
      throw new NotFoundError('First-run setup exists only on the desktop build.', {
        code: 'DESKTOP.SETUP_NOT_AVAILABLE',
      });
    }
    const db = this.connections.getClient(getDesktopTenantSchema());
    return db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`.execute(trx);
      const { count } = await trx
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow();
      if (Number(count) > 0) {
        throw new ConflictError('This installation is already set up.', { code: 'DESKTOP.ALREADY_SET_UP' });
      }

      const owner = await insertOwnerUser(trx, {
        email: input.email,
        password: input.password,
        fullName: input.ownerFullName,
      });

      const settings = await trx.selectFrom('tenant_settings').select('id').executeTakeFirst();
      if (settings) {
        await trx
          .updateTable('tenant_settings')
          .set({ company_name: input.companyName, updated_at: new Date() })
          .where('id', '=', settings.id)
          .execute();
      } else {
        await trx
          .insertInto('tenant_settings')
          .values({ id: randomUUID(), singleton: true, currency_code: 'EGP', company_name: input.companyName })
          .execute();
      }
      return { email: owner.email };
    });
  }

  private async countUsers(schema: string): Promise<number> {
    const { count } = await this.connections
      .getClient(schema)
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(count);
  }
}
