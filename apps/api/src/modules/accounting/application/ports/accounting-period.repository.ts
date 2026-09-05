import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  AccountingPeriod,
  AccountingPeriodStatus,
  CreateAccountingPeriodInput,
} from '../../domain/accounting-period.entity';

export interface AccountingPeriodRepository {
  list(db: Kysely<TenantDatabase>, fiscalYearId?: string): Promise<AccountingPeriod[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod | null>;
  findByFiscalYearId(db: Kysely<TenantDatabase>, fiscalYearId: string): Promise<AccountingPeriod[]>;
  /** Finds the (at most one) period whose [startDate, endDate] range contains `date`. */
  findByDate(db: Kysely<TenantDatabase>, date: string): Promise<AccountingPeriod | null>;
  create(db: Kysely<TenantDatabase>, input: CreateAccountingPeriodInput): Promise<AccountingPeriod>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: AccountingPeriodStatus,
  ): Promise<AccountingPeriod | null>;
}

export const ACCOUNTING_PERIOD_REPOSITORY = Symbol('ACCOUNTING_PERIOD_REPOSITORY');
