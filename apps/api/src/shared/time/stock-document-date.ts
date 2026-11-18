import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';
import { localIsoDate } from './local-date';
import { AppSettingsRepository } from '../app-settings/app-settings.repository';

/**
 * Checks the date of a document that moves stock, before anything is recorded:
 *  - not in the future, unless the settings hub allows future-dated documents
 *    ('documents.allowFutureDates');
 *  - not inside a closed accounting period. The document's journal entry would otherwise stay a
 *    draft (JournalEntriesService refuses to post into a closed period) while the stock moved —
 *    stock and books out of step with nobody told.
 *
 * Reads accounting_periods directly (read-only) so the stock modules don't call the Accounting
 * module (CLAUDE.md §2.6). No period covering the date → allowed (Accounting not set up yet).
 * A missing date means "today" and is checked as such.
 */
export async function assertStockDocumentDate(
  db: Kysely<TenantDatabase>,
  date: string | null | undefined,
): Promise<void> {
  const day = date ?? localIsoDate();
  if (day > localIsoDate() && !(await new AppSettingsRepository().get(db, 'documents.allowFutureDates'))) {
    throw new BusinessRuleError(`Document date ${day} is in the future.`, {
      code: 'DOCUMENT_DATE.IN_FUTURE',
      params: { date: day },
    });
  }
  const period = await db
    .selectFrom('accounting_periods')
    .select(['name', 'status'])
    .where('start_date', '<=', day)
    .where('end_date', '>=', day)
    .executeTakeFirst();
  if (period && period.status !== 'open') {
    throw new BusinessRuleError(`Accounting period "${period.name}" is closed — cannot move stock on ${day}.`, {
      code: 'DOCUMENT_DATE.PERIOD_CLOSED',
      params: { name: period.name, date: day },
    });
  }
}

/**
 * Items that already went out of stock (sales, write-offs) on a date after `date` — what a stock
 * document dated `date` arrives "behind". Its cost can't reach those movements (weighted average
 * runs in recording order), so the screens warn before posting it.
 */
export async function laterOutgoingMovements(
  db: Kysely<TenantDatabase>,
  date: string,
  productVariantIds: readonly string[],
): Promise<{ productVariantId: string; count: number; lastDate: string }[]> {
  if (productVariantIds.length === 0) return [];
  const rows = await db
    .selectFrom('stock_movements')
    .select((eb) => [
      'product_variant_id',
      eb.fn.countAll<string>().as('count'),
      eb.fn.max('movement_date').as('last_date'),
    ])
    .where('product_variant_id', 'in', [...new Set(productVariantIds)])
    .where('movement_type', 'in', ['out', 'adjustment_decrease'])
    .where('movement_date', '>', date)
    .groupBy('product_variant_id')
    .execute();
  return rows.map((row) => ({
    productVariantId: row.product_variant_id,
    count: Number(row.count),
    lastDate: String(row.last_date),
  }));
}
