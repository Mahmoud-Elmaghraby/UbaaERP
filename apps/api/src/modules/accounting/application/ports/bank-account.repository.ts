import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  BankAccount,
  BankAccountFilters,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from '../../domain/bank-account.entity';

export interface BankAccountRepository {
  list(db: Kysely<TenantDatabase>, filters?: BankAccountFilters): Promise<BankAccount[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<BankAccount | null>;
  findByChartOfAccountId(db: Kysely<TenantDatabase>, chartOfAccountId: string): Promise<BankAccount | null>;
  create(db: Kysely<TenantDatabase>, input: CreateBankAccountInput): Promise<BankAccount>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateBankAccountInput): Promise<BankAccount | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const BANK_ACCOUNT_REPOSITORY = Symbol('BANK_ACCOUNT_REPOSITORY');
