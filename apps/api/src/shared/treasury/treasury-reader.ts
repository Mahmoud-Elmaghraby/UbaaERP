import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

/**
 * Read access to treasuries (cash boxes, banks, e-wallets — the Treasury
 * module's table) for the modules whose documents move money: a customer
 * receipt, a supplier payment, a POS session. Validation only; nothing here
 * writes. (Replaces the bank-account reader of migration 0089.)
 */
export type TreasuryKind = 'cash' | 'bank' | 'wallet';

export interface TreasuryRef {
  id: string;
  code: string;
  name: string;
  kind: TreasuryKind;
  currency: string;
  isActive: boolean;
  chartOfAccountId: string | null;
}

export async function findTreasury(db: Kysely<TenantDatabase>, id: string): Promise<TreasuryRef | null> {
  const row = await db
    .selectFrom('treasuries')
    .select(['id', 'code', 'name', 'kind', 'currency', 'is_active', 'chart_of_account_id'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row
    ? {
        id: row.id,
        code: row.code,
        name: row.name,
        kind: row.kind as TreasuryKind,
        currency: row.currency,
        isActive: row.is_active,
        chartOfAccountId: row.chart_of_account_id,
      }
    : null;
}

/** The default cash box for a currency (where a cash receipt goes when none is chosen). */
export async function findDefaultCashTreasuryId(db: Kysely<TenantDatabase>, currency: string): Promise<string | null> {
  const row = await db
    .selectFrom('treasuries')
    .select('id')
    .where('kind', '=', 'cash')
    .where('currency', '=', currency)
    .where('is_active', '=', true)
    .orderBy('is_default', 'desc')
    .orderBy('created_at')
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * The treasury a receipt / payment goes through: the chosen one (must exist,
 * be active and hold the document's currency), else — for cash — the default
 * cash box. A non-cash document without one stays null (Accounting then uses
 * the default bank mapping, as before treasuries existed).
 */
export async function resolvePaymentTreasury(
  db: Kysely<TenantDatabase>,
  input: { treasuryId?: string | null; paymentMethod: string; currency: string },
): Promise<string | null> {
  if (input.treasuryId) {
    const treasury = await findTreasury(db, input.treasuryId);
    if (!treasury || !treasury.isActive) {
      throw new BusinessRuleError(`Treasury "${input.treasuryId}" does not exist or is inactive.`, {
        code: 'PAYMENT.TREASURY_UNUSABLE',
      });
    }
    if (treasury.currency !== input.currency) {
      throw new BusinessRuleError(
        `Treasury "${treasury.name}" holds ${treasury.currency}, but the document is in ${input.currency}.`,
        { code: 'PAYMENT.TREASURY_CURRENCY', params: { name: treasury.name, treasuryCurrency: treasury.currency, currency: input.currency } },
      );
    }
    return treasury.id;
  }
  return input.paymentMethod === 'cash' ? findDefaultCashTreasuryId(db, input.currency) : null;
}
