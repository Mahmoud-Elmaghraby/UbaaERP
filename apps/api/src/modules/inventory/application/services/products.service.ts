import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import type { Product, CreateProductInput, UpdateProductInput } from '../../domain/product.entity';
import type {
  ProductBarcode,
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
import { ProductCodesService } from './product-codes.service';
import { withTransaction } from '../../../../database/tenant/transaction.util';

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    private readonly codes: ProductCodesService,
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
      return await withTransaction(db, async (trx) => {
        // Typed code wins; otherwise the next 'product' number when auto codes are on.
        const code = await this.codes.resolveItemCode(trx, input.code, async (candidate) =>
          Boolean(await this.products.findByCode(trx, candidate)),
        );
        const product = await this.products.create(trx, { ...input, code });
        const variants: ProductVariant[] = [];
        if (!product.trackVariants) {
          const variant = await this.variants.create(trx, {
            productId: product.id,
            sku: await this.codes.resolveVariantSku(trx, input.defaultVariantSku, product.code),
            barcode: await this.codes.resolveBarcode(trx, input.defaultVariantBarcode),
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
          { code: 'PRODUCT.DUPLICATE_CODE_OR_VARIANT_SKU', params: { code: input.code ?? '' } },
        );
      }
      if (isPostgresForeignKeyViolation(err)) throw productReferenceNotFound(err, input);
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
      if (isPostgresForeignKeyViolation(err)) throw productReferenceNotFound(err, input);
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
    input: { sku?: string; attributeValues?: Record<string, unknown>; barcode?: string | null },
  ): Promise<ProductVariant> {
    const product = await this.getById(db, productId);
    try {
      return await withTransaction(db, async (trx) =>
        this.variants.create(trx, {
          productId,
          attributeValues: input.attributeValues,
          sku: await this.codes.resolveVariantSku(trx, input.sku, product.code),
          barcode: await this.codes.resolveBarcode(trx, input.barcode),
        }),
      );
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw variantUniqueViolation(err, input);
      throw err;
    }
  }

  listVariantBarcodes(db: Kysely<TenantDatabase>, productId: string, variantId: string): Promise<ProductBarcode[]> {
    return this.requireVariantOf(db, productId, variantId).then(() => this.variants.listBarcodes(db, variantId));
  }

  /**
   * Adds an alternate or pack barcode. A code must resolve to exactly one
   * item on scan, so it may not already be any variant's primary barcode or
   * another extra barcode.
   */
  async addVariantBarcode(
    db: Kysely<TenantDatabase>,
    productId: string,
    variantId: string,
    input: { barcode: string; quantity?: number; label?: string | null },
  ): Promise<ProductBarcode> {
    await this.requireVariantOf(db, productId, variantId);
    const barcode = input.barcode.trim();
    if (await this.variants.barcodeExists(db, barcode)) {
      throw duplicateEntity('PRODUCT_VARIANT', 'barcode', barcode);
    }
    try {
      return await this.variants.addBarcode(db, {
        productVariantId: variantId,
        barcode,
        quantity: input.quantity,
        label: input.label?.trim() || null,
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRODUCT_VARIANT', 'barcode', barcode);
      throw err;
    }
  }

  async removeVariantBarcode(
    db: Kysely<TenantDatabase>,
    productId: string,
    variantId: string,
    barcodeId: string,
  ): Promise<void> {
    await this.requireVariantOf(db, productId, variantId);
    if (!(await this.variants.deleteBarcode(db, variantId, barcodeId))) {
      throw entityNotFound('PRODUCT_VARIANT', barcodeId);
    }
  }

  /**
   * Variant matrix: creates every missing combination of the given option
   * values (e.g. sizes × colours) in one go, each with an auto SKU (code-2,
   * code-3…) and — in auto barcode mode — its own barcode. Combinations
   * that already exist are skipped, so it can be re-run after adding a new
   * size. Option names must be among the product's declared attributes.
   */
  async generateVariants(
    db: Kysely<TenantDatabase>,
    productId: string,
    options: Record<string, string[]>,
  ): Promise<ProductVariant[]> {
    const product = await this.getById(db, productId);
    const names = Object.keys(options).filter((name) => (options[name] ?? []).some((value) => value.trim()));
    const unknown = names.filter((name) => !product.attributes.includes(name));
    if (names.length === 0 || unknown.length > 0) {
      throw new BusinessRuleError('Pick values for the product\'s own attributes (e.g. size, colour).', {
        code: 'PRODUCT_VARIANT.MATRIX_INVALID_OPTIONS',
        params: { attributes: unknown.join('، ') },
      });
    }
    const valueLists = names.map((name) => [...new Set(options[name].map((value) => value.trim()).filter(Boolean))]);
    const total = valueLists.reduce((count, list) => count * list.length, 1);
    if (total > MAX_MATRIX_VARIANTS) {
      throw new BusinessRuleError(`At most ${MAX_MATRIX_VARIANTS} combinations can be generated at once.`, {
        code: 'PRODUCT_VARIANT.MATRIX_TOO_LARGE',
        params: { max: MAX_MATRIX_VARIANTS, requested: total },
      });
    }

    let combinations: Record<string, string>[] = [{}];
    names.forEach((name, index) => {
      combinations = combinations.flatMap((combo) => valueLists[index].map((value) => ({ ...combo, [name]: value })));
    });

    const keyOf = (values: Record<string, unknown>) => names.map((name) => String(values[name] ?? '').trim()).join('\u0000');
    const existing = new Set(product.variants.map((variant) => keyOf(variant.attributeValues)));

    try {
      return await withTransaction(db, async (trx) => {
        const created: ProductVariant[] = [];
        for (const combo of combinations) {
          if (existing.has(keyOf(combo))) continue;
          created.push(
            await this.variants.create(trx, {
              productId,
              attributeValues: combo,
              sku: await this.codes.resolveVariantSku(trx, undefined, product.code),
              barcode: await this.codes.resolveBarcode(trx, undefined),
            }),
          );
        }
        return created;
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw variantUniqueViolation(err, {});
      throw err;
    }
  }

  private async requireVariantOf(db: Kysely<TenantDatabase>, productId: string, variantId: string): Promise<ProductVariant> {
    const variant = await this.variants.findById(db, variantId);
    if (!variant || variant.productId !== productId) throw entityNotFound('PRODUCT_VARIANT', variantId);
    return variant;
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
    if (input.barcode && (await this.variants.extraBarcodeExists(db, input.barcode))) {
      throw duplicateEntity('PRODUCT_VARIANT', 'barcode', input.barcode);
    }
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

/** A product FK points at a missing unit / category / brand / tax rule — say which. */
function productReferenceNotFound(
  err: unknown,
  input: { unitOfMeasureId?: string; categoryId?: string | null; brandId?: string | null; taxRuleId?: string | null },
) {
  const constraint = violatedConstraint(err) ?? '';
  if (constraint.includes('category')) return entityNotFound('PRODUCT_CATEGORY', input.categoryId);
  if (constraint.includes('brand')) return entityNotFound('PRODUCT_BRAND', input.brandId);
  if (constraint.includes('tax_rule')) return entityNotFound('TAX_RULE', input.taxRuleId);
  return entityNotFound('UNIT_OF_MEASURE', input.unitOfMeasureId);
}

/** Upper bound for one matrix generation (e.g. 10 sizes × 20 colours = 200). */
const MAX_MATRIX_VARIANTS = 300;

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
