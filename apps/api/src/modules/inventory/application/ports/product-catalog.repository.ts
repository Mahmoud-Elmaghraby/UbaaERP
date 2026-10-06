import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CreateProductBrandInput,
  CreateProductCategoryInput,
  ProductBrand,
  ProductCategory,
  UpdateProductBrandInput,
  UpdateProductCategoryInput,
} from '../../domain/product-category.entity';

/** Product categories (a tree) and brands — the catalogue's classification lookups. */
export interface ProductCatalogRepository {
  listCategories(db: Kysely<TenantDatabase>): Promise<ProductCategory[]>;
  findCategoryById(db: Kysely<TenantDatabase>, id: string): Promise<ProductCategory | null>;
  createCategory(db: Kysely<TenantDatabase>, input: CreateProductCategoryInput): Promise<ProductCategory>;
  updateCategory(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategory | null>;
  deleteCategory(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;

  listBrands(db: Kysely<TenantDatabase>): Promise<ProductBrand[]>;
  createBrand(db: Kysely<TenantDatabase>, input: CreateProductBrandInput): Promise<ProductBrand>;
  updateBrand(db: Kysely<TenantDatabase>, id: string, input: UpdateProductBrandInput): Promise<ProductBrand | null>;
  deleteBrand(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PRODUCT_CATALOG_REPOSITORY = Symbol('PRODUCT_CATALOG_REPOSITORY');
