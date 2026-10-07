import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductImage } from '../../domain/product-image.entity';

export interface ProductImageRepository {
  listByProduct(db: Kysely<TenantDatabase>, productId: string): Promise<ProductImage[]>;
  /** The primary image of each of these products (one query, for lists). */
  primaryByProducts(db: Kysely<TenantDatabase>, productIds?: readonly string[]): Promise<ProductImage[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<ProductImage | null>;
  create(
    db: Kysely<TenantDatabase>,
    input: Omit<ProductImage, 'id' | 'createdAt' | 'sortOrder'>,
  ): Promise<ProductImage>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  setPrimary(db: Kysely<TenantDatabase>, productId: string, imageId: string): Promise<void>;
  reorder(db: Kysely<TenantDatabase>, productId: string, orderedIds: string[]): Promise<void>;
}

export const PRODUCT_IMAGE_REPOSITORY = Symbol('PRODUCT_IMAGE_REPOSITORY');
