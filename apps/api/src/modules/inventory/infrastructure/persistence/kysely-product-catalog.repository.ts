import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import type {
  ProductBrandsTable,
  ProductCategoriesTable,
  TenantDatabase,
} from '../../../../database/tenant/kysely-client';
import type { ProductCatalogRepository } from '../../application/ports/product-catalog.repository';
import type {
  CreateProductBrandInput,
  CreateProductCategoryInput,
  ProductBrand,
  ProductCategory,
  UpdateProductBrandInput,
  UpdateProductCategoryInput,
} from '../../domain/product-category.entity';

function categoryToDomain(row: Selectable<ProductCategoriesTable>): ProductCategory {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function brandToDomain(row: Selectable<ProductBrandsTable>): ProductBrand {
  return { id: row.id, name: row.name, isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class KyselyProductCatalogRepository implements ProductCatalogRepository {
  async listCategories(db: Kysely<TenantDatabase>): Promise<ProductCategory[]> {
    const rows = await db.selectFrom('product_categories').selectAll().orderBy('name').execute();
    return rows.map(categoryToDomain);
  }

  async findCategoryById(db: Kysely<TenantDatabase>, id: string): Promise<ProductCategory | null> {
    const row = await db.selectFrom('product_categories').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? categoryToDomain(row) : null;
  }

  async createCategory(db: Kysely<TenantDatabase>, input: CreateProductCategoryInput): Promise<ProductCategory> {
    const row = await db
      .insertInto('product_categories')
      .values({
        id: randomUUID(),
        name: input.name,
        parent_id: input.parentId ?? null,
        is_active: input.isActive ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return categoryToDomain(row);
  }

  async updateCategory(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategory | null> {
    const row = await db
      .updateTable('product_categories')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? categoryToDomain(row) : null;
  }

  async deleteCategory(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('product_categories').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async listBrands(db: Kysely<TenantDatabase>): Promise<ProductBrand[]> {
    const rows = await db.selectFrom('product_brands').selectAll().orderBy('name').execute();
    return rows.map(brandToDomain);
  }

  async createBrand(db: Kysely<TenantDatabase>, input: CreateProductBrandInput): Promise<ProductBrand> {
    const row = await db
      .insertInto('product_brands')
      .values({ id: randomUUID(), name: input.name, is_active: input.isActive ?? true })
      .returningAll()
      .executeTakeFirstOrThrow();
    return brandToDomain(row);
  }

  async updateBrand(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductBrandInput,
  ): Promise<ProductBrand | null> {
    const row = await db
      .updateTable('product_brands')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? brandToDomain(row) : null;
  }

  async deleteBrand(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('product_brands').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
