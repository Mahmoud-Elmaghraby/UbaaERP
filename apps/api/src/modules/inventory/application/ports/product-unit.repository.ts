import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductUnit, ProductUnitInput, ProductUnitLookup } from '../../domain/product-unit.entity';

export interface ProductUnitRepository {
  listByProductId(db: Kysely<TenantDatabase>, productId: string): Promise<ProductUnit[]>;
  /** Every product's units, keyed by product id — for the catalogue lookup. */
  listAllForLookup(db: Kysely<TenantDatabase>): Promise<Map<string, ProductUnitLookup[]>>;
  /** Replaces the product's whole unit list (inside the caller's transaction). */
  replace(db: Kysely<TenantDatabase>, productId: string, units: ProductUnitInput[]): Promise<ProductUnit[]>;
}

export const PRODUCT_UNIT_REPOSITORY = Symbol('PRODUCT_UNIT_REPOSITORY');
