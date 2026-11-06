import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import * as bcrypt from 'bcryptjs';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { ConflictError } from '../../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { SUPERVISE_PERMISSION, assertValidPin, hashPin } from '../../../../shared/auth/supervisor-approval';

/**
 * A supervisor's own POS approval PIN (migration 0113). Set and removed by
 * the user themself, behind their password. Two supervisors can't share a
 * PIN (the till identifies the approver by the PIN alone).
 */
@Injectable()
export class PosPinService {
  async status(db: Kysely<TenantDatabase>, userId: string, permissions: readonly string[]): Promise<{ canSupervise: boolean; hasPin: boolean }> {
    const row = await db.selectFrom('users').select('pos_pin_hash').where('id', '=', userId).executeTakeFirst();
    if (!row) throw entityNotFound('USER', userId);
    return { canSupervise: permissions.includes(SUPERVISE_PERMISSION), hasPin: row.pos_pin_hash !== null };
  }

  async set(db: Kysely<TenantDatabase>, userId: string, pin: string, currentPassword: string): Promise<void> {
    assertValidPin(pin);
    await this.assertPassword(db, userId, currentPassword);
    const others = await db
      .selectFrom('users')
      .select('pos_pin_hash')
      .where('id', '!=', userId)
      .where('pos_pin_hash', 'is not', null)
      .execute();
    for (const other of others) {
      if (other.pos_pin_hash && (await bcrypt.compare(pin, other.pos_pin_hash))) {
        throw new ConflictError('Another user already uses this PIN — choose a different one.', { code: 'POS_APPROVAL.PIN_TAKEN' });
      }
    }
    await db.updateTable('users').set({ pos_pin_hash: await hashPin(pin), updated_at: new Date() }).where('id', '=', userId).execute();
  }

  async remove(db: Kysely<TenantDatabase>, userId: string, currentPassword: string): Promise<void> {
    await this.assertPassword(db, userId, currentPassword);
    await db.updateTable('users').set({ pos_pin_hash: null, updated_at: new Date() }).where('id', '=', userId).execute();
  }

  private async assertPassword(db: Kysely<TenantDatabase>, userId: string, password: string): Promise<void> {
    const row = await db.selectFrom('users').select('password_hash').where('id', '=', userId).executeTakeFirst();
    if (!row) throw entityNotFound('USER', userId);
    if (!(await bcrypt.compare(password, row.password_hash))) {
      throw new ConflictError('Current password is incorrect.', { code: 'USER.CURRENT_PASSWORD_INCORRECT' });
    }
  }
}
