import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import { BusinessRuleError } from '../errors';

/**
 * The chart account money sits in, for any movement of a treasury (cash
 * box / bank / e-wallet): the treasury's own linked account when it has one,
 * otherwise the cash mapping (cash box, e-wallet, or a cash document with no
 * treasury) or the default bank mapping (bank, or a non-cash document with
 * no treasury). One rule for receipts, supplier payments, POS sessions and
 * treasury vouchers.
 */
export async function resolveTreasuryAccount(
  db: Kysely<TenantDatabase>,
  settings: AccountingSettings,
  input: { treasuryId?: string | null; paymentMethod?: string | null },
): Promise<string> {
  if (input.treasuryId) {
    const treasury = await db
      .selectFrom('treasuries')
      .select(['chart_of_account_id', 'kind'])
      .where('id', '=', input.treasuryId)
      .executeTakeFirst();
    if (treasury?.chart_of_account_id) return treasury.chart_of_account_id;
    if (treasury) {
      return treasury.kind === 'bank'
        ? requiredAccount(settings.defaultBankAccountId ?? settings.cashAccountId, 'حساب البنك الافتراضي')
        : requiredAccount(settings.cashAccountId, 'حساب النقدية');
    }
  }
  if (!input.paymentMethod || input.paymentMethod === 'cash') {
    return requiredAccount(settings.cashAccountId, 'حساب النقدية');
  }
  return requiredAccount(settings.defaultBankAccountId ?? settings.cashAccountId, 'حساب البنك الافتراضي');
}

export function requiredAccount(accountId: string | null, label: string): string {
  if (!accountId) {
    throw new BusinessRuleError(`Account mapping "${label}" is not configured.`, {
      code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
      params: { account: label },
    });
  }
  return accountId;
}
