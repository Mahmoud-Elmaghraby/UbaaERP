import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BankAccount, BankAccountFilters } from '../../domain/bank-account.entity';

/** Read-only since migration 0095 — the Treasury module creates and edits treasuries. */
export interface BankAccountRepository {
  list(db: Kysely<TenantDatabase>, filters?: BankAccountFilters): Promise<BankAccount[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<BankAccount | null>;
  findByChartOfAccountId(db: Kysely<TenantDatabase>, chartOfAccountId: string): Promise<BankAccount | null>;
}

export const BANK_ACCOUNT_REPOSITORY = Symbol('BANK_ACCOUNT_REPOSITORY');
