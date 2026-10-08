import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  CancelTreasuryVoucherDto,
  CreateTreasuryVoucherDto,
  TreasuryVoucherDto,
  TreasuryVoucherKindDto,
  TreasuryVoucherQueryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../shared/outbox/application/services/outbox-writer.service';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import { TreasuryMovementRegistry } from '../../../shared/treasury/treasury-movements';
import { NumberingSequencesService } from '../../settings/application/services/numbering-sequences.service';

export const TREASURY_VOUCHER_POSTED = 'treasury.voucher.posted';
export const TREASURY_VOUCHER_CANCELLED = 'treasury.voucher.cancelled';

const NUMBERING: Record<TreasuryVoucherKindDto, string> = {
  expense: 'treasury_expense',
  income: 'treasury_income',
  transfer: 'treasury_transfer',
};

/** Outbox metadata of both voucher events (Accounting posts / reverses it). */
export interface TreasuryVoucherEventMetadata {
  kind: TreasuryVoucherKindDto;
  voucherNumber: string;
  voucherDate: string;
  treasuryId: string;
  toTreasuryId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** The item's own chart account at posting time (null → Accounting reports the missing mapping). */
  categoryAccountId: string | null;
  amount: { amountMinorUnits: string; currency: string };
  description: string | null;
}

/**
 * Expense voucher (سند صرف مصروف), other-income receipt (سند قبض إيراد) and
 * transfer between treasuries (تحويل). Posted on creation — a mistake is
 * corrected by cancelling (with a reason) and recording a new one, so the
 * history never changes silently. Each posting/cancellation writes an
 * outbox event in the same transaction (CLAUDE.md §2.7); Accounting, when
 * enabled, turns it into a journal entry.
 */
@Injectable()
export class TreasuryVouchersService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
    private readonly movements: TreasuryMovementRegistry,
  ) {}

  async list(db: Kysely<TenantDatabase>, query: TreasuryVoucherQueryDto): Promise<TreasuryVoucherDto[]> {
    let q = this.baseQuery(db);
    if (query.kind) q = q.where('v.kind', '=', query.kind);
    if (query.treasuryId) {
      const id = query.treasuryId;
      q = q.where((eb) => eb.or([eb('v.treasury_id', '=', id), eb('v.to_treasury_id', '=', id)]));
    }
    if (query.from) q = q.where('v.voucher_date', '>=', query.from);
    if (query.to) q = q.where('v.voucher_date', '<=', query.to);
    const rows = await q.orderBy('v.voucher_date', 'desc').orderBy('v.created_at', 'desc').limit(1000).execute();
    return rows.map(toDto);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<TreasuryVoucherDto> {
    const row = await this.baseQuery(db).where('v.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('TREASURY_VOUCHER', id);
    return toDto(row);
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateTreasuryVoucherDto,
    context: { schema: string; actorUserId: string | null },
  ): Promise<TreasuryVoucherDto> {
    const treasury = await this.usableTreasury(db, input.treasuryId);
    let toTreasuryId: string | null = null;
    let category: { id: string; name: string; chart_of_account_id: string | null } | null = null;

    if (input.kind === 'transfer') {
      if (!input.toTreasuryId || input.toTreasuryId === input.treasuryId) {
        throw new BusinessRuleError('A transfer needs two different treasuries.', { code: 'TREASURY_VOUCHER.TRANSFER_SAME_TREASURY' });
      }
      const target = await this.usableTreasury(db, input.toTreasuryId);
      if (target.currency !== treasury.currency) {
        throw new BusinessRuleError('Transfers between currencies are not supported.', {
          code: 'TREASURY_VOUCHER.TRANSFER_CURRENCY',
          params: { from: treasury.currency, to: target.currency },
        });
      }
      toTreasuryId = target.id;
    } else {
      const row = await db
        .selectFrom('treasury_categories')
        .select(['id', 'name', 'kind', 'is_active', 'chart_of_account_id'])
        .where('id', '=', input.categoryId!)
        .executeTakeFirst();
      if (!row) throw entityNotFound('TREASURY_CATEGORY', input.categoryId);
      if (row.kind !== input.kind || !row.is_active) {
        throw new BusinessRuleError(`Item "${row.name}" can't be used on this voucher.`, {
          code: 'TREASURY_CATEGORY.WRONG_KIND',
          params: { name: row.name },
        });
      }
      category = row;
    }

    const id = randomUUID();
    await withTransaction(db, async (trx) => {
      if (input.kind !== 'income') await this.movements.assertCanWithdraw(trx, treasury.id, BigInt(input.amountMinorUnits));
      const number = await this.numbering.allocateNext(trx, NUMBERING[input.kind], null);
      await trx
        .insertInto('treasury_vouchers')
        .values({
          id,
          voucher_number: number.formatted,
          kind: input.kind,
          voucher_date: input.voucherDate,
          treasury_id: treasury.id,
          to_treasury_id: toTreasuryId,
          category_id: category?.id ?? null,
          amount: input.amountMinorUnits,
          currency: treasury.currency,
          counterparty: input.counterparty ?? null,
          description: input.description ?? null,
          reference: input.reference ?? null,
          created_by_user_id: context.actorUserId,
        })
        .execute();
      await this.writeEvent(trx, TREASURY_VOUCHER_POSTED, context, id, {
        kind: input.kind,
        voucherNumber: number.formatted,
        voucherDate: input.voucherDate,
        treasuryId: treasury.id,
        toTreasuryId,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        categoryAccountId: category?.chart_of_account_id ?? null,
        amount: { amountMinorUnits: input.amountMinorUnits, currency: treasury.currency },
        description: input.description ?? null,
      });
    });
    return this.getById(db, id);
  }

  async cancel(
    db: Kysely<TenantDatabase>,
    id: string,
    input: CancelTreasuryVoucherDto,
    context: { schema: string; actorUserId: string | null },
  ): Promise<TreasuryVoucherDto> {
    await withTransaction(db, async (trx) => {
      const row = await trx.selectFrom('treasury_vouchers').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!row) throw entityNotFound('TREASURY_VOUCHER', id);
      if (row.status === 'cancelled') {
        throw new BusinessRuleError('The voucher is already cancelled.', { code: 'TREASURY_VOUCHER.ALREADY_CANCELLED' });
      }
      // Undoing money that came in takes it back out of the treasury that received it.
      const receiver = row.kind === 'income' ? row.treasury_id : row.kind === 'transfer' ? row.to_treasury_id : null;
      await this.movements.assertCanWithdraw(trx, receiver, BigInt(row.amount));
      await trx
        .updateTable('treasury_vouchers')
        .set({ status: 'cancelled', cancelled_at: new Date(), cancel_reason: input.reason, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      const category = row.category_id
        ? await trx.selectFrom('treasury_categories').select(['name', 'chart_of_account_id']).where('id', '=', row.category_id).executeTakeFirst()
        : undefined;
      await this.writeEvent(trx, TREASURY_VOUCHER_CANCELLED, context, id, {
        kind: row.kind as TreasuryVoucherKindDto,
        voucherNumber: row.voucher_number,
        voucherDate: row.voucher_date,
        treasuryId: row.treasury_id,
        toTreasuryId: row.to_treasury_id,
        categoryId: row.category_id,
        categoryName: category?.name ?? null,
        categoryAccountId: category?.chart_of_account_id ?? null,
        amount: { amountMinorUnits: row.amount, currency: row.currency },
        description: input.reason,
      });
    });
    return this.getById(db, id);
  }

  private async usableTreasury(db: Kysely<TenantDatabase>, id: string) {
    const row = await db.selectFrom('treasuries').select(['id', 'name', 'currency', 'is_active']).where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('TREASURY', id);
    if (!row.is_active) {
      throw new BusinessRuleError(`Treasury "${row.name}" is inactive.`, { code: 'TREASURY.INACTIVE', params: { name: row.name } });
    }
    return row;
  }

  private writeEvent(
    trx: Kysely<TenantDatabase>,
    eventType: string,
    context: { schema: string; actorUserId: string | null },
    id: string,
    metadata: TreasuryVoucherEventMetadata,
  ): Promise<void> {
    return this.outbox.write(trx, eventType, {
      schema: context.schema,
      entityType: 'treasury_voucher',
      entityId: id,
      action: eventType === TREASURY_VOUCHER_POSTED ? 'posted' : 'cancelled',
      actorUserId: context.actorUserId,
      occurredAt: new Date(),
      metadata: metadata as unknown as Record<string, unknown>,
    });
  }

  private baseQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('treasury_vouchers as v')
      .innerJoin('treasuries as t', 't.id', 'v.treasury_id')
      .leftJoin('treasuries as tt', 'tt.id', 'v.to_treasury_id')
      .leftJoin('treasury_categories as c', 'c.id', 'v.category_id')
      .selectAll('v')
      .select(['t.name as treasury_name', 'tt.name as to_treasury_name', 'c.name as category_name']);
  }
}

type VoucherRow = {
  id: string;
  voucher_number: string;
  kind: string;
  status: string;
  voucher_date: string;
  treasury_id: string;
  treasury_name: string;
  to_treasury_id: string | null;
  to_treasury_name: string | null;
  category_id: string | null;
  category_name: string | null;
  amount: string;
  currency: string;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  created_at: Date;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

function toDto(row: VoucherRow): TreasuryVoucherDto {
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    kind: row.kind as TreasuryVoucherKindDto,
    status: row.status as 'posted' | 'cancelled',
    voucherDate: row.voucher_date,
    treasuryId: row.treasury_id,
    treasuryName: row.treasury_name,
    toTreasuryId: row.to_treasury_id,
    toTreasuryName: row.to_treasury_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    amount: { amountMinorUnits: row.amount, currency: row.currency },
    counterparty: row.counterparty,
    description: row.description,
    reference: row.reference,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };
}
