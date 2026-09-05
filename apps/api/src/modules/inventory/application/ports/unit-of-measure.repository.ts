import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  UnitOfMeasure,
  CreateUnitOfMeasureInput,
  UpdateUnitOfMeasureInput,
} from '../../domain/unit-of-measure.entity';

export interface UnitOfMeasureRepository {
  list(db: Kysely<TenantDatabase>): Promise<UnitOfMeasure[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<UnitOfMeasure | null>;
  create(db: Kysely<TenantDatabase>, input: CreateUnitOfMeasureInput): Promise<UnitOfMeasure>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateUnitOfMeasureInput): Promise<UnitOfMeasure | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const UNIT_OF_MEASURE_REPOSITORY = Symbol('UNIT_OF_MEASURE_REPOSITORY');
