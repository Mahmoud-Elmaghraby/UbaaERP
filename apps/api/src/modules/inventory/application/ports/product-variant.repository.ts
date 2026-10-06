import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  ProductVariantLookup,
} from '../../domain/product-variant.entity';

export interface ProductVariantRepository {
  /** Every variant of every product, joined with its product and unit, ordered by product name then SKU. */
  listLookup(db: Kysely<TenantDatabase>): Promise<ProductVariantLookup[]>;
  /** Whether any variant already uses this SKU / barcode (generated codes must not collide with typed ones). */
  skuExists(db: Kysely<TenantDatabase>, sku: string): Promise<boolean>;
  barcodeExists(db: Kysely<TenantDatabase>, barcode: string): Promise<boolean>;
  listByProductId(db: Kysely<TenantDatabase>, productId: string): Promise<ProductVariant[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<ProductVariant | null>;
  create(db: Kysely<TenantDatabase>, input: CreateProductVariantInput): Promise<ProductVariant>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateProductVariantInput): Promise<ProductVariant | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PRODUCT_VARIANT_REPOSITORY = Symbol('PRODUCT_VARIANT_REPOSITORY');
