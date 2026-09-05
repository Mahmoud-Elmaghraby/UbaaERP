import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
} from '../../domain/product-variant.entity';

export interface ProductVariantRepository {
  listByProductId(db: Kysely<TenantDatabase>, productId: string): Promise<ProductVariant[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<ProductVariant | null>;
  create(db: Kysely<TenantDatabase>, input: CreateProductVariantInput): Promise<ProductVariant>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateProductVariantInput): Promise<ProductVariant | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PRODUCT_VARIANT_REPOSITORY = Symbol('PRODUCT_VARIANT_REPOSITORY');
