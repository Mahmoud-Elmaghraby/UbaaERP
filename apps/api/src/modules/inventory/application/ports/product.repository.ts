import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Product, CreateProductInput, UpdateProductInput } from '../../domain/product.entity';

export interface ProductRepository {
  list(db: Kysely<TenantDatabase>): Promise<Product[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Product | null>;
  findByCode(db: Kysely<TenantDatabase>, code: string): Promise<Product | null>;
  /** The service resolves the code (typed or auto-generated) before calling this. */
  create(db: Kysely<TenantDatabase>, input: CreateProductInput & { code: string; unitOfMeasureId: string }): Promise<Product>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateProductInput): Promise<Product | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
  /** True once any of the product's variants has a stock movement — its unit/tracking then become immutable. */
  hasStockMovements(db: Kysely<TenantDatabase>, productId: string): Promise<boolean>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
