import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CostCenter,
  CostCenterFilters,
  CreateCostCenterInput,
  UpdateCostCenterInput,
} from '../../domain/cost-center.entity';

export interface CostCenterRepository {
  list(db: Kysely<TenantDatabase>, filters?: CostCenterFilters): Promise<CostCenter[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<CostCenter | null>;
  create(db: Kysely<TenantDatabase>, input: CreateCostCenterInput): Promise<CostCenter>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateCostCenterInput): Promise<CostCenter | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const COST_CENTER_REPOSITORY = Symbol('COST_CENTER_REPOSITORY');
