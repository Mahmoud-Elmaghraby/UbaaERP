import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  ChartOfAccount,
  ChartOfAccountFilters,
  CreateChartOfAccountInput,
  UpdateChartOfAccountInput,
} from '../../domain/chart-of-account.entity';

export interface ChartOfAccountRepository {
  list(db: Kysely<TenantDatabase>, filters?: ChartOfAccountFilters): Promise<ChartOfAccount[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<ChartOfAccount | null>;
  findByCode(db: Kysely<TenantDatabase>, code: string): Promise<ChartOfAccount | null>;
  listChildren(db: Kysely<TenantDatabase>, parentId: string): Promise<ChartOfAccount[]>;
  create(db: Kysely<TenantDatabase>, input: CreateChartOfAccountInput): Promise<ChartOfAccount>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateChartOfAccountInput): Promise<ChartOfAccount | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const CHART_OF_ACCOUNT_REPOSITORY = Symbol('CHART_OF_ACCOUNT_REPOSITORY');
