import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { ProductsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductRepository } from '../../application/ports/product.repository';
import type {
  Product,
  ProductTrackingType,
  ProductItemType,
  ProductMasterDataInput,
  CreateProductInput,
  UpdateProductInput,
} from '../../domain/product.entity';

function toDomain(row: Selectable<ProductsTable>): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unitOfMeasureId: row.unit_of_measure_id,
    trackVariants: row.track_variants,
    trackingType: row.tracking_type as ProductTrackingType,
    attributes: (row.attributes ?? []) as string[],
    isActive: row.is_active,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    itemType: row.item_type as ProductItemType,
    categoryId: row.category_id,
    brandId: row.brand_id,
    salePrice: toMoney(row.sale_price_amount, row.sale_price_currency),
    purchasePrice: toMoney(row.purchase_price_amount, row.purchase_price_currency),
    taxRuleId: row.tax_rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMoney(amount: string | null, currency: string | null): Money | null {
  return amount !== null && currency !== null ? Money.fromMinorUnits(BigInt(amount), currency) : null;
}

/** Only the master-data columns the caller actually sent (undefined = leave unchanged). */
function masterDataColumns(input: ProductMasterDataInput) {
  return {
    ...(input.itemType !== undefined ? { item_type: input.itemType } : {}),
    ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
    ...(input.brandId !== undefined ? { brand_id: input.brandId } : {}),
    ...(input.taxRuleId !== undefined ? { tax_rule_id: input.taxRuleId } : {}),
    ...(input.salePrice !== undefined
      ? {
          sale_price_amount: input.salePrice ? input.salePrice.toMinorUnits().toString() : null,
          sale_price_currency: input.salePrice ? input.salePrice.currency : null,
        }
      : {}),
    ...(input.purchasePrice !== undefined
      ? {
          purchase_price_amount: input.purchasePrice ? input.purchasePrice.toMinorUnits().toString() : null,
          purchase_price_currency: input.purchasePrice ? input.purchasePrice.currency : null,
        }
      : {}),
  };
}

export class KyselyProductRepository implements ProductRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Product[]> {
    const rows = await db.selectFrom('products').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Product | null> {
    const row = await db.selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByCode(db: Kysely<TenantDatabase>, code: string): Promise<Product | null> {
    const row = await db.selectFrom('products').selectAll().where('code', '=', code).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateProductInput & { code: string }): Promise<Product> {
    const row = await db
      .insertInto('products')
      .values({
        ...masterDataColumns(input),
        id: randomUUID(),
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        unit_of_measure_id: input.unitOfMeasureId,
        track_variants: input.trackVariants ?? false,
        tracking_type: input.trackingType ?? 'none',
        attributes: JSON.stringify(input.attributes ?? []),
        is_active: input.isActive ?? true,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateProductInput): Promise<Product | null> {
    const row = await db
      .updateTable('products')
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.unitOfMeasureId !== undefined ? { unit_of_measure_id: input.unitOfMeasureId } : {}),
        ...(input.trackVariants !== undefined ? { track_variants: input.trackVariants } : {}),
        ...(input.trackingType !== undefined ? { tracking_type: input.trackingType } : {}),
        ...(input.attributes !== undefined ? { attributes: JSON.stringify(input.attributes) } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        ...masterDataColumns(input),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('products').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async hasStockMovements(db: Kysely<TenantDatabase>, productId: string): Promise<boolean> {
    const row = await db
      .selectFrom('stock_movements')
      .innerJoin('product_variants', 'product_variants.id', 'stock_movements.product_variant_id')
      .select('stock_movements.id')
      .where('product_variants.product_id', '=', productId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
