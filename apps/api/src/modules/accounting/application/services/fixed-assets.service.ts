import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type {
  DepreciationRunResultDto,
  DisposeFixedAssetDto,
  FixedAssetDepreciationDto,
  FixedAssetDto,
  SaveFixedAssetDto,
} from '@erp-platform/contracts';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';
import type { FixedAssetsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { localIsoDate } from '../../../../shared/time/local-date';
import { BusinessRuleError, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';
import { JournalEntriesService } from './journal-entries.service';
import { monthEnd, monthEndsBetween, previousMonthEnd } from './date-math';

export const DEPRECIATION_SOURCE = 'fixed_asset_depreciation';
export const DISPOSAL_SOURCE = 'fixed_asset_disposal';

type AssetRow = Selectable<FixedAssetsTable>;

/**
 * الأصول الثابتة. A register of long-lived assets (cost, salvage, useful
 * life, the three accounts) depreciated straight-line, one full month at a
 * time from the depreciation start month: monthly = (cost − salvage −
 * opening accumulated) / remaining months, the last month taking the
 * rounding rest. A depreciation run posts ONE entry per month for all
 * assets (Dr depreciation expense / Cr accumulated depreciation, per cost
 * center) and records each asset's share, so a month is never depreciated
 * twice. Disposal removes the asset from the books with its gain or loss.
 *
 * The purchase itself is recorded the usual way (a purchase invoice or a
 * journal entry to the asset account); the register does not post it.
 */
@Injectable()
export class FixedAssetsService {
  constructor(private readonly journalEntries: JournalEntriesService) {}

  async list(db: Kysely<TenantDatabase>): Promise<FixedAssetDto[]> {
    const rows = await db.selectFrom('fixed_assets').selectAll().orderBy('code').execute();
    const depreciation = await this.depreciationTotals(db);
    return rows.map((row) => toDto(row, depreciation.get(row.id)));
  }

  async get(db: Kysely<TenantDatabase>, id: string): Promise<FixedAssetDto & { depreciations: FixedAssetDepreciationDto[] }> {
    const row = await this.find(db, id);
    const depreciation = await this.depreciationTotals(db, id);
    const history = await db
      .selectFrom('fixed_asset_depreciations')
      .select(['id', 'period_end', 'amount', 'journal_entry_id'])
      .where('fixed_asset_id', '=', id)
      .orderBy('period_end', 'desc')
      .execute();
    return {
      ...toDto(row, depreciation.get(id)),
      depreciations: history.map((h) => ({
        id: h.id,
        periodEnd: toDate(h.period_end),
        amountMinorUnits: String(h.amount),
        journalEntryId: h.journal_entry_id,
      })),
    };
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveFixedAssetDto): Promise<FixedAssetDto> {
    const cost = BigInt(input.costMinorUnits);
    const salvage = BigInt(input.salvageMinorUnits ?? '0');
    const opening = BigInt(input.openingAccumulatedMinorUnits ?? '0');
    if (salvage + opening > cost) {
      throw new BusinessRuleError('Salvage value plus opening depreciation cannot exceed the cost.', {
        code: 'FIXED_ASSET.AMOUNTS_EXCEED_COST',
      });
    }
    const values = {
      name: input.name,
      acquisition_date: input.acquisitionDate,
      depreciation_start: input.depreciationStart ?? input.acquisitionDate,
      cost_amount: cost.toString(),
      salvage_amount: salvage.toString(),
      opening_accumulated_amount: opening.toString(),
      useful_life_months: input.usefulLifeMonths,
      asset_account_id: input.assetAccountId,
      accumulated_account_id: input.accumulatedAccountId,
      expense_account_id: input.expenseAccountId,
      cost_center_id: input.costCenterId ?? null,
      notes: input.notes ?? null,
    };
    try {
      if (id) {
        const existing = await this.find(db, id);
        const posted = (await this.depreciationTotals(db, id)).get(id);
        if (posted && posted.count > 0) {
          // Once depreciated, the numbers that drove past entries stay as they were.
          const changed =
            String(existing.cost_amount) !== values.cost_amount ||
            String(existing.salvage_amount) !== values.salvage_amount ||
            String(existing.opening_accumulated_amount) !== values.opening_accumulated_amount ||
            existing.useful_life_months !== values.useful_life_months ||
            toDate(existing.depreciation_start) !== values.depreciation_start;
          if (changed) {
            throw new BusinessRuleError('This asset was already depreciated; its cost and life can no longer change.', {
              code: 'FIXED_ASSET.ALREADY_DEPRECIATED',
            });
          }
        }
        const row = await db
          .updateTable('fixed_assets')
          .set({ ...values, ...(input.code ? { code: input.code } : {}), updated_at: new Date() })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toDto(row, posted);
      }
      const code = input.code?.trim() || (await this.nextCode(db));
      const row = await db
        .insertInto('fixed_assets')
        .values({ id: randomUUID(), code, ...values })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDto(row, undefined);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('FIXED_ASSET', 'code', input.code ?? '');
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.find(db, id);
    const posted = (await this.depreciationTotals(db, id)).get(id);
    if (posted && posted.count > 0) {
      throw new BusinessRuleError('This asset has depreciation in the books; dispose of it instead.', {
        code: 'FIXED_ASSET.ALREADY_DEPRECIATED',
      });
    }
    await db.deleteFrom('fixed_assets').where('id', '=', id).execute();
  }

  /**
   * Depreciates every active asset for each whole month ending on or before
   * `through` (default: last month's end) that it wasn't depreciated for yet.
   */
  async runDepreciation(db: Kysely<TenantDatabase>, through = previousMonthEnd(localIsoDate())): Promise<DepreciationRunResultDto> {
    const assets = await db.selectFrom('fixed_assets').selectAll().where('status', '=', 'active').execute();
    if (assets.length === 0) return { assets: 0, entries: 0, totalMinorUnits: '0' };
    const totals = await this.depreciationTotals(db);

    // period end → that month's shares
    const byMonth = new Map<string, { asset: AssetRow; amount: bigint }[]>();
    const touched = new Set<string>();
    for (const asset of assets) {
      const state = totals.get(asset.id);
      const firstMonth = state?.lastPeriodEnd ? nextMonthEnd(state.lastPeriodEnd) : monthEnd(toDate(asset.depreciation_start));
      if (firstMonth > through) continue;
      let accumulated = BigInt(asset.opening_accumulated_amount) + (state?.total ?? 0n);
      let monthsDone = (state?.count ?? 0) + openingMonths(asset);
      for (const periodEnd of monthEndsBetween(firstMonth, through)) {
        const amount = monthlyAmount(asset, accumulated, monthsDone);
        if (amount <= 0n) break;
        byMonth.set(periodEnd, [...(byMonth.get(periodEnd) ?? []), { asset, amount }]);
        accumulated += amount;
        monthsDone += 1;
        touched.add(asset.id);
      }
    }

    let total = 0n;
    let entries = 0;
    for (const periodEnd of [...byMonth.keys()].sort()) {
      const shares = byMonth.get(periodEnd)!;
      await withTransaction(db, async (trx) => {
        const runId = randomUUID();
        const lines = depreciationLines(shares);
        const entry = await this.journalEntries.createAuto(trx, {
          entryDate: periodEnd,
          description: `إهلاك الأصول الثابتة — ${periodEnd.slice(0, 7)}`,
          lines,
          sourceReferenceType: DEPRECIATION_SOURCE,
          sourceReferenceId: runId,
        });
        await trx
          .insertInto('fixed_asset_depreciations')
          .values(
            shares.map((share) => ({
              id: randomUUID(),
              fixed_asset_id: share.asset.id,
              period_end: periodEnd,
              amount: share.amount.toString(),
              journal_entry_id: entry.id,
            })),
          )
          .execute();
      });
      entries += 1;
      total += shares.reduce((sum, share) => sum + share.amount, 0n);
    }

    // Assets that reached their salvage value are done.
    if (touched.size > 0) {
      const after = await this.depreciationTotals(db);
      for (const asset of assets) {
        if (!touched.has(asset.id)) continue;
        const accumulated = BigInt(asset.opening_accumulated_amount) + (after.get(asset.id)?.total ?? 0n);
        if (accumulated >= BigInt(asset.cost_amount) - BigInt(asset.salvage_amount)) {
          await db.updateTable('fixed_assets').set({ status: 'fully_depreciated', updated_at: new Date() }).where('id', '=', asset.id).execute();
        }
      }
    }
    return { assets: touched.size, entries, totalMinorUnits: total.toString() };
  }

  /**
   * Sells or scraps an asset: depreciation is first brought up to the end of
   * the month before disposal, then one entry removes cost and accumulated
   * depreciation, records the proceeds and the gain (credit) or loss (debit).
   */
  async dispose(db: Kysely<TenantDatabase>, id: string, input: DisposeFixedAssetDto): Promise<FixedAssetDto> {
    const asset = await this.find(db, id);
    if (asset.status === 'disposed') {
      throw new BusinessRuleError('This asset was already disposed of.', { code: 'FIXED_ASSET.ALREADY_DISPOSED' });
    }
    const proceeds = BigInt(input.proceedsMinorUnits);
    if (proceeds > 0n && !input.proceedsAccountId) {
      throw new BusinessRuleError('Choose the account that received the sale proceeds.', { code: 'FIXED_ASSET.PROCEEDS_ACCOUNT_REQUIRED' });
    }
    if (asset.status === 'active') await this.runDepreciation(db, previousMonthEnd(input.date));

    return withTransaction(db, async (trx) => {
      const accumulated =
        BigInt(asset.opening_accumulated_amount) + ((await this.depreciationTotals(trx, id)).get(id)?.total ?? 0n);
      const cost = BigInt(asset.cost_amount);
      const gain = proceeds - (cost - accumulated); // > 0 gain, < 0 loss
      const lines: CreateJournalEntryLineInput[] = [];
      const debit = (accountId: string, amount: bigint) =>
        amount > 0n && lines.push({ accountId, debitAmountMinorUnits: amount.toString(), creditAmountMinorUnits: '0' });
      const credit = (accountId: string, amount: bigint) =>
        amount > 0n && lines.push({ accountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: amount.toString() });
      debit(asset.accumulated_account_id, accumulated);
      if (input.proceedsAccountId) debit(input.proceedsAccountId, proceeds);
      if (gain < 0n) debit(input.gainLossAccountId, -gain);
      credit(asset.asset_account_id, cost);
      if (gain > 0n) credit(input.gainLossAccountId, gain);

      await this.journalEntries.createAuto(trx, {
        entryDate: input.date,
        description: `استبعاد أصل ثابت — ${asset.code} ${asset.name}`,
        lines,
        sourceReferenceType: DISPOSAL_SOURCE,
        sourceReferenceId: asset.id,
      });
      const row = await trx
        .updateTable('fixed_assets')
        .set({ status: 'disposed', disposed_at: input.date, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDto(row, (await this.depreciationTotals(trx, id)).get(id));
    });
  }

  private async find(db: Kysely<TenantDatabase>, id: string): Promise<AssetRow> {
    const row = await db.selectFrom('fixed_assets').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('FIXED_ASSET', id);
    return row;
  }

  private async nextCode(db: Kysely<TenantDatabase>): Promise<string> {
    const row = await db.selectFrom('fixed_assets').select(sql<number>`count(*)::int`.as('n')).executeTakeFirst();
    let n = Number(row?.n ?? 0) + 1;
    for (;;) {
      const code = `FA-${String(n).padStart(4, '0')}`;
      const taken = await db.selectFrom('fixed_assets').select('id').where('code', '=', code).executeTakeFirst();
      if (!taken) return code;
      n += 1;
    }
  }

  private async depreciationTotals(
    db: Kysely<TenantDatabase>,
    assetId?: string,
  ): Promise<Map<string, { total: bigint; count: number; lastPeriodEnd: string | null }>> {
    let query = db
      .selectFrom('fixed_asset_depreciations')
      .select([
        'fixed_asset_id',
        sql<string>`SUM(amount)`.as('total'),
        sql<number>`count(*)::int`.as('count'),
        sql<string>`to_char(MAX(period_end), 'YYYY-MM-DD')`.as('last'),
      ])
      .groupBy('fixed_asset_id');
    if (assetId) query = query.where('fixed_asset_id', '=', assetId);
    const rows = await query.execute();
    return new Map(rows.map((r) => [r.fixed_asset_id, { total: BigInt(String(r.total).split('.')[0]!), count: Number(r.count), lastPeriodEnd: r.last }]));
  }
}

/** Months the opening accumulated depreciation stands for (so the remaining life is right). */
export function openingMonths(asset: AssetRow): number {
  const depreciable = BigInt(asset.cost_amount) - BigInt(asset.salvage_amount);
  const opening = BigInt(asset.opening_accumulated_amount);
  if (opening === 0n || depreciable <= 0n) return 0;
  return Number((opening * BigInt(asset.useful_life_months)) / depreciable);
}

/** This month's straight-line amount; the last month of the life takes whatever is left. */
export function monthlyAmount(asset: AssetRow, accumulated: bigint, monthsDone: number): bigint {
  const remaining = BigInt(asset.cost_amount) - BigInt(asset.salvage_amount) - accumulated;
  if (remaining <= 0n) return 0n;
  const monthsLeft = asset.useful_life_months - monthsDone;
  if (monthsLeft <= 1) return remaining;
  const base = (BigInt(asset.cost_amount) - BigInt(asset.salvage_amount)) / BigInt(asset.useful_life_months);
  return base > remaining ? remaining : base;
}

function depreciationLines(shares: { asset: AssetRow; amount: bigint }[]): CreateJournalEntryLineInput[] {
  const debit = new Map<string, { accountId: string; costCenterId: string | null; amount: bigint }>();
  const credit = new Map<string, bigint>();
  for (const { asset, amount } of shares) {
    const key = `${asset.expense_account_id}|${asset.cost_center_id ?? ''}`;
    const current = debit.get(key) ?? { accountId: asset.expense_account_id, costCenterId: asset.cost_center_id, amount: 0n };
    current.amount += amount;
    debit.set(key, current);
    credit.set(asset.accumulated_account_id, (credit.get(asset.accumulated_account_id) ?? 0n) + amount);
  }
  return [
    ...[...debit.values()].map((d) => ({
      accountId: d.accountId,
      debitAmountMinorUnits: d.amount.toString(),
      creditAmountMinorUnits: '0',
      costCenterId: d.costCenterId,
    })),
    ...[...credit.entries()].map(([accountId, amount]) => ({
      accountId,
      debitAmountMinorUnits: '0',
      creditAmountMinorUnits: amount.toString(),
    })),
  ];
}

function nextMonthEnd(periodEnd: string): string {
  const [y, m] = periodEnd.split('-').map(Number);
  const nextFirst = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`;
  return monthEnd(nextFirst);
}

function toDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}

function toDto(row: AssetRow, depreciation: { total: bigint; lastPeriodEnd: string | null } | undefined): FixedAssetDto {
  const cost = BigInt(row.cost_amount);
  const salvage = BigInt(row.salvage_amount);
  const accumulated = BigInt(row.opening_accumulated_amount) + (depreciation?.total ?? 0n);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    acquisitionDate: toDate(row.acquisition_date),
    depreciationStart: toDate(row.depreciation_start),
    costMinorUnits: cost.toString(),
    salvageMinorUnits: salvage.toString(),
    openingAccumulatedMinorUnits: String(row.opening_accumulated_amount),
    usefulLifeMonths: row.useful_life_months,
    assetAccountId: row.asset_account_id,
    accumulatedAccountId: row.accumulated_account_id,
    expenseAccountId: row.expense_account_id,
    costCenterId: row.cost_center_id,
    status: row.status as FixedAssetDto['status'],
    disposedAt: row.disposed_at ? toDate(row.disposed_at) : null,
    notes: row.notes,
    accumulatedMinorUnits: accumulated.toString(),
    bookValueMinorUnits: (cost - accumulated).toString(),
    monthlyDepreciationMinorUnits: ((cost - salvage) / BigInt(row.useful_life_months)).toString(),
    lastDepreciatedThrough: depreciation?.lastPeriodEnd ?? null,
  };
}
