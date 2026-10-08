import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type {
  CreateTreasuryDto,
  TreasuryDto,
  TreasuryKindDto,
  TreasuryLookupDto,
  UpdateTreasuryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase, TreasuriesTable } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../shared/outbox/application/services/outbox-writer.service';
import { TreasuryMovementRegistry } from '../../../shared/treasury/treasury-movements';
import { BusinessRuleError, ConflictError, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';
import { localIsoDate } from '../../../shared/time/local-date';

export const TREASURY_OPENING_BALANCE_EVENT = 'treasury.treasury.opening_balance_set';

const money = (minor: bigint, currency: string) => ({ amountMinorUnits: minor.toString(), currency });

/**
 * Treasuries (cash boxes, banks, e-wallets): CRUD, the default per kind and
 * currency, and current balances (opening balance + every movement any
 * module reported through TreasuryMovementRegistry).
 *
 * The opening balance is a business fact of the treasury; when it changes,
 * an outbox event lets Accounting (if enabled) post the difference against
 * the opening-balance equity account — same rule as customer/supplier
 * opening balances.
 */
@Injectable()
export class TreasuriesService {
  constructor(
    private readonly movements: TreasuryMovementRegistry,
    private readonly outbox: OutboxWriterService,
  ) {}

  async list(db: Kysely<TenantDatabase>): Promise<TreasuryDto[]> {
    const [rows, balances] = await Promise.all([
      db.selectFrom('treasuries').selectAll().orderBy('kind').orderBy('code').execute(),
      this.balances(db),
    ]);
    return rows.map((row) => toDto(row, balances.get(row.id) ?? 0n));
  }

  async lookup(db: Kysely<TenantDatabase>): Promise<TreasuryLookupDto[]> {
    const rows = await db
      .selectFrom('treasuries')
      .select(['id', 'code', 'name', 'kind', 'currency', 'is_default'])
      .where('is_active', '=', true)
      .orderBy('is_default', 'desc')
      .orderBy('kind')
      .orderBy('code')
      .execute();
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind as TreasuryKindDto, currency: r.currency, isDefault: r.is_default }));
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<TreasuryDto> {
    const row = await this.findRow(db, id);
    const balances = await this.balances(db, id);
    return toDto(row, balances.get(id) ?? 0n);
  }

  async findRow(db: Kysely<TenantDatabase>, id: string): Promise<Selectable<TreasuriesTable>> {
    const row = await db.selectFrom('treasuries').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('TREASURY', id);
    return row;
  }

  /** Movement totals (without opening balances) per treasury, up to `asOf` (default: everything). */
  async balances(db: Kysely<TenantDatabase>, treasuryId: string | null = null, asOf?: string): Promise<Map<string, bigint>> {
    const movements = await this.movements.list(db, treasuryId);
    const totals = new Map<string, bigint>();
    for (const m of movements) {
      if (asOf && m.date > asOf) continue;
      totals.set(m.treasuryId, (totals.get(m.treasuryId) ?? 0n) + m.amountMinor);
    }
    return totals;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateTreasuryDto,
    context: { schema: string; actorUserId: string | null },
  ): Promise<TreasuryDto> {
    const id = randomUUID();
    try {
      await withTransaction(db, async (trx) => {
        if (input.isDefault) await this.clearDefault(trx, input.kind, input.currency);
        await trx
          .insertInto('treasuries')
          .values({
            id,
            code: input.code,
            name: input.name,
            kind: input.kind,
            currency: input.currency,
            bank_name: input.bankName ?? null,
            account_number: input.accountNumber ?? null,
            iban: input.iban ?? null,
            chart_of_account_id: input.chartOfAccountId ?? null,
            opening_balance_amount: input.openingBalanceMinorUnits ?? '0',
            opening_balance_date: input.openingBalanceDate ?? null,
            is_default: input.isDefault ?? false,
            notes: input.notes ?? null,
          })
          .execute();
        await this.writeOpeningBalanceEvent(trx, context, id, input.name, {
          date: input.openingBalanceDate ?? localIsoDate(),
          previous: 0n,
          next: BigInt(input.openingBalanceMinorUnits ?? '0'),
          currency: input.currency,
        });
      });
    } catch (err) {
      throw this.translateUniqueViolation(err, input.code);
    }
    return this.getById(db, id);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateTreasuryDto,
    context: { schema: string; actorUserId: string | null },
  ): Promise<TreasuryDto> {
    try {
      await withTransaction(db, async (trx) => {
        const existing = await trx.selectFrom('treasuries').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
        if (!existing) throw entityNotFound('TREASURY', id);
        if (input.isDefault) await this.clearDefault(trx, existing.kind, existing.currency);
        await trx
          .updateTable('treasuries')
          .set({
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.bankName !== undefined ? { bank_name: input.bankName } : {}),
            ...(input.accountNumber !== undefined ? { account_number: input.accountNumber } : {}),
            ...(input.iban !== undefined ? { iban: input.iban } : {}),
            ...(input.chartOfAccountId !== undefined ? { chart_of_account_id: input.chartOfAccountId } : {}),
            ...(input.openingBalanceMinorUnits !== undefined ? { opening_balance_amount: input.openingBalanceMinorUnits } : {}),
            ...(input.openingBalanceDate !== undefined ? { opening_balance_date: input.openingBalanceDate } : {}),
            ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
            ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updated_at: new Date(),
          })
          .where('id', '=', id)
          .execute();
        if (input.openingBalanceMinorUnits !== undefined) {
          await this.writeOpeningBalanceEvent(trx, context, id, existing.name, {
            date: input.openingBalanceDate ?? existing.opening_balance_date ?? localIsoDate(),
            previous: BigInt(existing.opening_balance_amount),
            next: BigInt(input.openingBalanceMinorUnits),
            currency: existing.currency,
          });
        }
      });
    } catch (err) {
      throw this.translateUniqueViolation(err, input.code);
    }
    return this.getById(db, id);
  }

  /** Only a treasury nothing ever went through can be deleted; otherwise deactivate it. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const row = await this.findRow(db, id);
    const movements = await this.movements.list(db, id);
    const referenced = await db
      .selectFrom('pos_sessions')
      .select('id')
      .where('treasury_id', '=', id)
      .unionAll(db.selectFrom('payments_received').select('id').where('treasury_id', '=', id))
      .unionAll(db.selectFrom('supplier_payments').select('id').where('treasury_id', '=', id))
      .unionAll(db.selectFrom('treasury_vouchers').select('id').where((eb) => eb.or([eb('treasury_id', '=', id), eb('to_treasury_id', '=', id)])))
      .limit(1)
      .execute();
    if (movements.length > 0 || referenced.length > 0) {
      throw new BusinessRuleError(`Treasury "${row.name}" has movements and cannot be deleted.`, {
        code: 'TREASURY.IN_USE',
        params: { name: row.name },
      });
    }
    await db.deleteFrom('treasuries').where('id', '=', id).execute();
  }

  private async clearDefault(db: Kysely<TenantDatabase>, kind: string, currency: string): Promise<void> {
    await db
      .updateTable('treasuries')
      .set({ is_default: false, updated_at: new Date() })
      .where('kind', '=', kind)
      .where('currency', '=', currency)
      .where('is_default', '=', true)
      .execute();
  }

  private async writeOpeningBalanceEvent(
    trx: Kysely<TenantDatabase>,
    context: { schema: string; actorUserId: string | null },
    treasuryId: string,
    name: string,
    change: { date: string; previous: bigint; next: bigint; currency: string },
  ): Promise<void> {
    if (change.previous === change.next) return;
    await this.outbox.write(trx, TREASURY_OPENING_BALANCE_EVENT, {
      schema: context.schema,
      entityType: 'treasury',
      entityId: treasuryId,
      action: 'opening_balance_set',
      actorUserId: context.actorUserId,
      occurredAt: new Date(),
      metadata: {
        changeId: randomUUID(),
        treasuryName: name,
        date: change.date,
        previous: money(change.previous, change.currency),
        next: money(change.next, change.currency),
      },
    });
  }

  private translateUniqueViolation(err: unknown, code: string | undefined): unknown {
    if (!isPostgresUniqueViolation(err)) return err;
    const constraint = (err as { constraint?: string }).constraint ?? '';
    if (constraint.includes('chart_of_account')) {
      return new ConflictError('That chart account is already linked to another treasury.', {
        code: 'TREASURY.CHART_ACCOUNT_ALREADY_LINKED',
      });
    }
    return duplicateEntity('TREASURY', 'code', code);
  }
}

export function toDto(row: Selectable<TreasuriesTable>, movementsMinor: bigint): TreasuryDto {
  const opening = BigInt(row.opening_balance_amount);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as TreasuryKindDto,
    currency: row.currency,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    iban: row.iban,
    chartOfAccountId: row.chart_of_account_id,
    openingBalance: money(opening, row.currency),
    openingBalanceDate: row.opening_balance_date,
    isActive: row.is_active,
    isDefault: row.is_default,
    notes: row.notes,
    balance: money(opening + movementsMinor, row.currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
