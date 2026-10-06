import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PRODUCT_CATALOG_REPOSITORY, type ProductCatalogRepository } from '../ports/product-catalog.repository';
import type {
  CreateProductBrandInput,
  CreateProductCategoryInput,
  ProductBrand,
  ProductCategory,
  UpdateProductBrandInput,
  UpdateProductCategoryInput,
} from '../../domain/product-category.entity';
import { BusinessRuleError, ConflictError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Categories (a tree) and brands — plain CRUD (CLAUDE.md §2.1) plus the two
 * rules a tree needs: a parent must exist, and a category can't be moved
 * under its own descendant. Deleting a category/brand still used by a
 * product or by child categories is refused (deactivate it instead).
 */
@Injectable()
export class ProductCatalogService {
  constructor(@Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepository) {}

  listCategories(db: Kysely<TenantDatabase>): Promise<ProductCategory[]> {
    return this.repository.listCategories(db);
  }

  async createCategory(db: Kysely<TenantDatabase>, input: CreateProductCategoryInput): Promise<ProductCategory> {
    if (input.parentId) await this.requireCategory(db, input.parentId);
    try {
      return await this.repository.createCategory(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRODUCT_CATEGORY', 'name', input.name);
      throw err;
    }
  }

  async updateCategory(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategory> {
    await this.requireCategory(db, id);
    if (input.parentId) await this.assertNotDescendant(db, id, input.parentId);
    try {
      const updated = await this.repository.updateCategory(db, id, input);
      if (!updated) throw entityNotFound('PRODUCT_CATEGORY', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRODUCT_CATEGORY', 'name', input.name);
      throw err;
    }
  }

  async deleteCategory(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    try {
      const deleted = await this.repository.deleteCategory(db, id);
      if (!deleted) throw entityNotFound('PRODUCT_CATEGORY', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError(`Category "${id}" still has products or sub-categories.`, {
          code: 'PRODUCT_CATEGORY.IN_USE',
        });
      }
      throw err;
    }
  }

  listBrands(db: Kysely<TenantDatabase>): Promise<ProductBrand[]> {
    return this.repository.listBrands(db);
  }

  async createBrand(db: Kysely<TenantDatabase>, input: CreateProductBrandInput): Promise<ProductBrand> {
    try {
      return await this.repository.createBrand(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRODUCT_BRAND', 'name', input.name);
      throw err;
    }
  }

  async updateBrand(db: Kysely<TenantDatabase>, id: string, input: UpdateProductBrandInput): Promise<ProductBrand> {
    try {
      const updated = await this.repository.updateBrand(db, id, input);
      if (!updated) throw entityNotFound('PRODUCT_BRAND', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRODUCT_BRAND', 'name', input.name);
      throw err;
    }
  }

  async deleteBrand(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    try {
      const deleted = await this.repository.deleteBrand(db, id);
      if (!deleted) throw entityNotFound('PRODUCT_BRAND', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError(`Brand "${id}" is still used by products.`, { code: 'PRODUCT_BRAND.IN_USE' });
      }
      throw err;
    }
  }

  private async requireCategory(db: Kysely<TenantDatabase>, id: string): Promise<ProductCategory> {
    const category = await this.repository.findCategoryById(db, id);
    if (!category) throw entityNotFound('PRODUCT_CATEGORY', id);
    return category;
  }

  /** Walks up from the new parent; reaching `id` means the move would create a cycle. */
  private async assertNotDescendant(db: Kysely<TenantDatabase>, id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    for (let depth = 0; cursor && depth < 100; depth += 1) {
      if (cursor === id) {
        throw new BusinessRuleError('A category cannot be moved under itself or one of its sub-categories.', {
          code: 'PRODUCT_CATEGORY.CYCLE',
        });
      }
      cursor = (await this.requireCategory(db, cursor)).parentId;
    }
  }
}
