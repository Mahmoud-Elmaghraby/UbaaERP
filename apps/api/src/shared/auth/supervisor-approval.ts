import { Global, Injectable, Module } from '@nestjs/common';
import type { Kysely } from 'kysely';
import * as bcrypt from 'bcryptjs';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

export const SUPERVISE_PERMISSION = 'pos.supervise';

const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;

export interface ApprovalRequest {
  /** What is being approved ('discount', 'return', 'cash_out'…). */
  action: string;
  /** The supervisor's PIN typed on the till; not needed when the actor supervises. */
  pin?: string | null;
  actorUserId: string | null;
  actorPermissions: readonly string[];
  posSessionId?: string | null;
  referenceId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Supervisor approval on a till (موافقة المشرف). A user holding
 * 'pos.supervise' approves their own actions; anyone else needs a
 * supervisor's PIN typed on the same screen. Every approval is logged in
 * pos_approvals (who, for whom, what). Five wrong PINs from one cashier
 * lock PIN entry for five minutes.
 *
 * Shared (not Sales-owned) because both the till (Sales) and drawer cash
 * movements (Treasury) need it.
 */
@Injectable()
export class SupervisorApprovalService {
  private readonly failures = new Map<string, { count: number; until: number }>();

  /** True when this user can act without a PIN. */
  static canSupervise(permissions: readonly string[]): boolean {
    return permissions.includes(SUPERVISE_PERMISSION);
  }

  /** Approves (or refuses) and logs it. Returns the approving user's id. Call inside the action's transaction. */
  async approve(db: Kysely<TenantDatabase>, schema: string, request: ApprovalRequest): Promise<string> {
    let approverId: string;
    if (request.actorUserId && SupervisorApprovalService.canSupervise(request.actorPermissions)) {
      approverId = request.actorUserId;
    } else {
      const pin = request.pin?.trim();
      if (!pin) {
        throw new BusinessRuleError('This action needs a supervisor approval.', {
          code: 'POS_APPROVAL.REQUIRED',
          params: { action: request.action },
        });
      }
      approverId = await this.verifyPin(db, schema, request.actorUserId, pin);
    }
    await db
      .insertInto('pos_approvals')
      .values({
        pos_session_id: request.posSessionId ?? null,
        action: request.action,
        cashier_user_id: request.actorUserId,
        approver_user_id: approverId,
        reference_id: request.referenceId ?? null,
        details: JSON.stringify(request.details ?? {}),
      })
      .execute();
    return approverId;
  }

  private async verifyPin(db: Kysely<TenantDatabase>, schema: string, actorUserId: string | null, pin: string): Promise<string> {
    const key = `${schema}:${actorUserId ?? '-'}`;
    const state = this.failures.get(key);
    if (state && state.count >= MAX_FAILURES && state.until > Date.now()) {
      throw new BusinessRuleError('Too many wrong PINs — try again in a few minutes.', { code: 'POS_APPROVAL.LOCKED' });
    }
    const supervisors = await db
      .selectFrom('users as u')
      .innerJoin('role_permissions as rp', 'rp.role_id', 'u.role_id')
      .innerJoin('permissions as p', 'p.id', 'rp.permission_id')
      .select(['u.id', 'u.pos_pin_hash'])
      .where('p.key', '=', SUPERVISE_PERMISSION)
      .where('u.is_active', '=', true)
      .where('u.pos_pin_hash', 'is not', null)
      .execute();
    for (const supervisor of supervisors) {
      if (supervisor.pos_pin_hash && (await bcrypt.compare(pin, supervisor.pos_pin_hash))) {
        this.failures.delete(key);
        return supervisor.id;
      }
    }
    const count = state && state.until > Date.now() ? state.count + 1 : 1;
    this.failures.set(key, { count, until: Date.now() + LOCK_MS });
    throw new BusinessRuleError('Wrong supervisor PIN.', { code: 'POS_APPROVAL.INVALID_PIN' });
  }
}

/** PINs are 4–6 digits. */
export function assertValidPin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new BusinessRuleError('A PIN is 4 to 6 digits.', { code: 'POS_APPROVAL.PIN_FORMAT' });
  }
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

@Global()
@Module({ providers: [SupervisorApprovalService], exports: [SupervisorApprovalService] })
export class SupervisorApprovalModule {}
