import { randomUUID } from 'node:crypto';
import { Money } from '@erp-platform/shared-kernel';
import type { Kysely, Selectable } from 'kysely';
import type { PosSessionsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ClosePosSessionFields, PosSessionRepository } from '../../application/ports/pos-session.repository';
import type { OpenPosSessionInput, PosSession, PosSessionFilters, PosSessionStatus } from '../../domain/pos-session.entity';

function toDomain(row: Selectable<PosSessionsTable>): PosSession {
  const currency = row.currency;
  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    status: row.status as PosSessionStatus,
    openingCashAmount: Money.fromMinorUnits(BigInt(row.opening_cash_amount), currency),
    expectedCashAmount: row.expected_cash_amount === null ? null : Money.fromMinorUnits(BigInt(row.expected_cash_amount), currency),
    countedCashAmount: row.counted_cash_amount === null ? null : Money.fromMinorUnits(BigInt(row.counted_cash_amount), currency),
    varianceAmount: row.variance_amount === null ? null : Money.fromMinorUnits(BigInt(row.variance_amount), currency),
    notes: row.notes,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPosSessionRepository implements PosSessionRepository {
  async list(db: Kysely<TenantDatabase>, filters?: PosSessionFilters): Promise<PosSession[]> {
    let query = db.selectFrom('pos_sessions').selectAll();
    if (filters?.status) query = query.where('status', '=', filters.status);
    if (filters?.cashierUserId) query = query.where('cashier_user_id', '=', filters.cashierUserId);
    const rows = await query.orderBy('opened_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PosSession | null> {
    const row = await db.selectFrom('pos_sessions').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findOpenByCashierId(db: Kysely<TenantDatabase>, cashierUserId: string): Promise<PosSession | null> {
    const row = await db
      .selectFrom('pos_sessions')
      .selectAll()
      .where('cashier_user_id', '=', cashierUserId)
      .where('status', '=', 'open')
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async sumCashTendersForSession(db: Kysely<TenantDatabase>, sessionId: string): Promise<string | null> {
    const row = await db
      .selectFrom('payments_received')
      .select((eb) => [eb.fn.sum<string>('amount_amount').as('total')])
      .where('pos_session_id', '=', sessionId)
      .where('payment_method', '=', 'cash')
      .where('status', '=', 'posted')
      .executeTakeFirst();
    return row?.total ?? null;
  }

  async create(db: Kysely<TenantDatabase>, input: OpenPosSessionInput): Promise<PosSession> {
    const row = await db
      .insertInto('pos_sessions')
      .values({
        id: randomUUID(),
        cashier_user_id: input.cashierUserId,
        status: 'open',
        opening_cash_amount: input.openingCashAmount.toMinorUnits().toString(),
        currency: input.openingCashAmount.currency,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async close(db: Kysely<TenantDatabase>, id: string, fields: ClosePosSessionFields): Promise<PosSession | null> {
    const row = await db
      .updateTable('pos_sessions')
      .set({
        status: 'closed',
        expected_cash_amount: fields.expectedCashAmount.toMinorUnits().toString(),
        counted_cash_amount: fields.countedCashAmount.toMinorUnits().toString(),
        variance_amount: fields.varianceAmount.toMinorUnits().toString(),
        notes: fields.notes,
        closed_at: fields.closedAt,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'open')
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
