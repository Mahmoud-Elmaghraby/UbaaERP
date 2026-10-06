import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import type { Product, CreateProductInput, UpdateProductInput } from '../../domain/product.entity';
import type {
  ProductVariant,
  ProductVariantLookup,
  UpdateProductVariantInput,
} from '../../domain/product-variant.entity';
import {
  BusinessRuleError,
  ConflictError,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
} from '../errors';
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
            barcode: input.defaultVariantBarcode ?? null,
          });
          variants.push(variant);
        }
        return { ...product, variants };
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err) && violatedConstraint(err) === 'product_variants_barcode_unique') {
        throw duplicateEntity('PRODUCT_VARIANT', 'barcode', input.defaultVariantBarcode ?? undefined);
      }
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
    await this.assertStockDefiningFieldsUnchanged(db, id, input);
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

  /**
   * Stock quantities and costs are stored in the product's own unit, and
   * lot/serial bookkeeping depends on its tracking type — so once stock has
   * moved, changing either would silently reinterpret every existing
   * balance (e.g. 100 "pieces" becoming 100 "boxes"). Inventory audit
   * 2026-10, H3.
   */
  private async assertStockDefiningFieldsUnchanged(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductInput,
  ): Promise<void> {
    if (input.unitOfMeasureId === undefined && input.trackingType === undefined) return;
    const current = await this.products.findById(db, id);
    if (!current) throw entityNotFound('PRODUCT', id);
    const unitChanges = input.unitOfMeasureId !== undefined && input.unitOfMeasureId !== current.unitOfMeasureId;
    const trackingChanges = input.trackingType !== undefined && input.trackingType !== current.trackingType;
    if (!unitChanges && !trackingChanges) return;
    if (!(await this.products.hasStockMovements(db, id))) return;
    if (unitChanges) {
      throw new BusinessRuleError(
        `Product "${id}" already has stock movements; its unit of measure can no longer be changed.`,
        { code: 'PRODUCT.UNIT_LOCKED_BY_STOCK' },
      );
    }
    throw new BusinessRuleError(
      `Product "${id}" already has stock movements; its tracking type can no longer be changed.`,
      { code: 'PRODUCT.TRACKING_LOCKED_BY_STOCK' },
    );
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    try {
      const deleted = await this.products.delete(db, id);
      if (!deleted) throw entityNotFound('PRODUCT', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError(
          `Product "${id}" is referenced by stock movements, lots or documents and cannot be deleted — deactivate it instead.`,
          { code: 'PRODUCT.IN_USE' },
        );
      }
      throw err;
    }
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
      if (isPostgresUniqueViolation(err)) throw variantUniqueViolation(err, input);
      throw err;
    }
  }

  /** The whole catalogue as flat variant rows — see ProductVariantLookup. */
  listVariantLookup(db: Kysely<TenantDatabase>): Promise<ProductVariantLookup[]> {
    return this.variants.listLookup(db);
  }

  async updateVariant(
    db: Kysely<TenantDatabase>,
    productId: string,
    variantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariant> {
    const existing = await this.variants.findById(db, variantId);
    if (!existing || existing.productId !== productId) throw entityNotFound('PRODUCT_VARIANT', variantId);
    try {
      const updated = await this.variants.update(db, variantId, input);
      if (!updated) throw entityNotFound('PRODUCT_VARIANT', variantId);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw variantUniqueViolation(err, input);
      throw err;
    }
  }
}

function violatedConstraint(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'constraint' in err
    ? String((err as { constraint?: unknown }).constraint)
    : undefined;
}

/** product_variants has two unique keys (sku, barcode) — report the one actually violated. */
function variantUniqueViolation(err: unknown, input: { sku?: string; barcode?: string | null }) {
  return violatedConstraint(err) === 'product_variants_barcode_unique'
    ? duplicateEntity('PRODUCT_VARIANT', 'barcode', input.barcode ?? undefined)
    : duplicateEntity('PRODUCT_VARIANT', 'sku', input.sku);
}
