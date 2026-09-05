import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  FiscalYear,
  FiscalYearStatus,
  CreateFiscalYearInput,
  UpdateFiscalYearInput,
} from '../../domain/fiscal-year.entity';

export interface FiscalYearRepository {
  list(db: Kysely<TenantDatabase>): Promise<FiscalYear[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<FiscalYear | null>;
  create(db: Kysely<TenantDatabase>, input: CreateFiscalYearInput): Promise<FiscalYear>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateFiscalYearInput): Promise<FiscalYear | null>;
  updateStatus(db: Kysely<TenantDatabase>, id: string, status: FiscalYearStatus): Promise<FiscalYear | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const FISCAL_YEAR_REPOSITORY = Symbol('FISCAL_YEAR_REPOSITORY');
