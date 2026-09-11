import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import type { Product, CreateProductInput, UpdateProductInput } from '../../domain/product.entity';
import type { ProductVariant } from '../../domain/product-variant.entity';
import { ConflictError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Product[]> {
    return this.products.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<ProductWithVariants> {
    const product = await this.products.findById(db, id);
    if (!product) throw entityNotFound('PRODUCT', id);
    const variants = await this.variants.listByProductId(db, id);
    return { ...product, variants };
  }

  /**
   * Creates the product and, when trackVariants is false (the common
   * "this item has no size/color options" case), one default variant in
   * the same transaction — every downstream Inventory table
   * (stock_levels, stock_movements) keys off product_variant_id
   * uniformly, so a product must never exist with zero variants (see
   * migration 0017's note).
   */
  async create(db: Kysely<TenantDatabase>, input: CreateProductInput): Promise<ProductWithVariants> {
    try {
      return await db.transaction().execute(async (trx) => {
        const product = await this.products.create(trx, input);
        const variants: ProductVariant[] = [];
        if (!product.trackVariants) {
          const variant = await this.variants.create(trx, {
            productId: product.id,
            sku: input.defaultVariantSku ?? product.code,
          });
          variants.push(variant);
        }
        return { ...product, variants };
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          `A product with code "${input.code}" (or its default variant SKU) already exists.`,
          { code: 'PRODUCT.DUPLICATE_CODE_OR_VARIANT_SKU', params: { code: input.code } },
        );
      }
      if (isPostgresForeignKeyViolation(err)) {
        throw entityNotFound('UNIT_OF_MEASURE', input.unitOfMeasureId);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateProductInput): Promise<Product> {
    try {
      const updated = await this.products.update(db, id, input);
      if (!updated) throw entityNotFound('PRODUCT', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('PRODUCT', 'code', input.code);
      }
      if (isPostgresForeignKeyViolation(err)) {
        throw entityNotFound('UNIT_OF_MEASURE', input.unitOfMeasureId);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.products.delete(db, id);
    if (!deleted) throw entityNotFound('PRODUCT', id);
  }

  async addVariant(
    db: Kysely<TenantDatabase>,
    productId: string,
    input: { sku: string; attributeValues?: Record<string, unknown>; barcode?: string | null },
  ): Promise<ProductVariant> {
    await this.getById(db, productId);
    try {
      return await this.variants.create(db, { productId, ...input });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('PRODUCT_VARIANT', 'sku', input.sku);
      }
      throw err;
    }
  }
}
