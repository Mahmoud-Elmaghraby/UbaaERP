import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

export interface BankAccountRef {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
}

/**
 * Read-only lookup of a bank account (owned by Accounting, migration 0058)
 * for the documents that move money through one — customer receipts and
 * supplier payments. Same read-only precedent as shared/catalog readers:
 * nothing in Accounting is called or changed.
 */
export async function findBankAccount(db: Kysely<TenantDatabase>, id: string): Promise<BankAccountRef | null> {
  const row = await db
    .selectFrom('bank_accounts')
    .select(['id', 'name', 'currency', 'is_active'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? { id: row.id, name: row.name, currency: row.currency, isActive: row.is_active } : null;
}

/**
 * The one rule set for "money went into / out of this bank account":
 * only for a non-cash method, the account must exist, be active and hold
 * the document's currency.
 */
export async function assertUsableBankAccount(
  db: Kysely<TenantDatabase>,
  bankAccountId: string | null | undefined,
  paymentMethod: string,
  currency: string,
): Promise<void> {
  if (!bankAccountId) return;
  if (paymentMethod === 'cash') {
    throw new BusinessRuleError('A cash payment does not go through a bank account.', {
      code: 'PAYMENT.BANK_ACCOUNT_FOR_CASH',
    });
  }
  const account = await findBankAccount(db, bankAccountId);
  if (!account || !account.isActive) {
    throw new BusinessRuleError(`Bank account "${bankAccountId}" does not exist or is inactive.`, {
      code: 'PAYMENT.BANK_ACCOUNT_UNUSABLE',
    });
  }
  if (account.currency !== currency) {
    throw new BusinessRuleError(
      `Bank account "${account.name}" holds ${account.currency}, but the payment is in ${currency}.`,
      { code: 'PAYMENT.BANK_ACCOUNT_CURRENCY', params: { name: account.name, accountCurrency: account.currency, currency } },
    );
  }
}
