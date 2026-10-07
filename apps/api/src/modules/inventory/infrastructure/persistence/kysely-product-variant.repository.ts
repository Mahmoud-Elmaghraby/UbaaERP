import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  ProductBarcodesTable,
  ProductVariantsTable,
  TenantDatabase,
} from '../../../../database/tenant/kysely-client';
import type { ProductVariantRepository } from '../../application/ports/product-variant.repository';
import type {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  ProductVariantLookup,
  ProductBarcode,
  CreateProductBarcodeInput,
} from '../../domain/product-variant.entity';
import { KyselyProductUnitRepository } from './kysely-product-unit.repository';

function toDomain(row: Selectable<ProductVariantsTable>): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    attributeValues: (row.attribute_values ?? {}) as Record<string, unknown>,
    barcode: row.barcode,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function barcodeToDomain(row: Selectable<ProductBarcodesTable>): ProductBarcode {
  return {
    id: row.id,
    productVariantId: row.product_variant_id,
    barcode: row.barcode,
    quantity: Number(row.quantity),
    label: row.label,
    createdAt: row.created_at,
  };
}

function money(amount: string | null, currency: string | null): Money | null {
  return amount !== null && currency !== null ? Money.fromMinorUnits(BigInt(amount), currency) : null;
}

export class KyselyProductVariantRepository implements ProductVariantRepository {
  async listByProductId(db: Kysely<TenantDatabase>, productId: string): Promise<ProductVariant[]> {
    const rows = await db
      .selectFrom('product_variants')
      .selectAll()
      .where('product_id', '=', productId)
      .orderBy('sku')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<ProductVariant | null> {
    const row = await db.selectFrom('product_variants').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateProductVariantInput): Promise<ProductVariant> {
    const row = await db
      .insertInto('product_variants')
      .values({
        id: randomUUID(),
        product_id: input.productId,
        sku: input.sku,
        attribute_values: JSON.stringify(input.attributeValues ?? {}),
        barcode: input.barcode ?? null,
        is_active: input.isActive ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async skuExists(db: Kysely<TenantDatabase>, sku: string): Promise<boolean> {
    const row = await db.selectFrom('product_variants').select('id').where('sku', '=', sku).executeTakeFirst();
    return row !== undefined;
  }

  async barcodeExists(db: Kysely<TenantDatabase>, barcode: string): Promise<boolean> {
    const row = await db.selectFrom('product_variants').select('id').where('barcode', '=', barcode).executeTakeFirst();
    return row !== undefined || (await this.extraBarcodeExists(db, barcode));
  }

  async extraBarcodeExists(db: Kysely<TenantDatabase>, barcode: string): Promise<boolean> {
    const row = await db.selectFrom('product_barcodes').select('id').where('barcode', '=', barcode).executeTakeFirst();
    return row !== undefined;
  }

  async listBarcodes(db: Kysely<TenantDatabase>, productVariantId: string): Promise<ProductBarcode[]> {
    const rows = await db
      .selectFrom('product_barcodes')
      .selectAll()
      .where('product_variant_id', '=', productVariantId)
      .orderBy('created_at')
      .execute();
    return rows.map(barcodeToDomain);
  }

  async addBarcode(db: Kysely<TenantDatabase>, input: CreateProductBarcodeInput): Promise<ProductBarcode> {
    const row = await db
      .insertInto('product_barcodes')
      .values({
        id: randomUUID(),
        product_variant_id: input.productVariantId,
        barcode: input.barcode,
        quantity: String(input.quantity ?? 1),
        label: input.label ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return barcodeToDomain(row);
  }

  async deleteBarcode(db: Kysely<TenantDatabase>, productVariantId: string, barcodeId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('product_barcodes')
      .where('id', '=', barcodeId)
      .where('product_variant_id', '=', productVariantId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async listLookup(db: Kysely<TenantDatabase>): Promise<ProductVariantLookup[]> {
    const rows = await db
      .selectFrom('product_variants')
      .innerJoin('products', 'products.id', 'product_variants.product_id')
      .innerJoin('units_of_measure', 'units_of_measure.id', 'products.unit_of_measure_id')
      .select([
        'product_variants.id as id',
        'product_variants.product_id as product_id',
        'products.code as product_code',
        'products.name as product_name',
        'product_variants.sku as sku',
        'product_variants.barcode as barcode',
        'product_variants.attribute_values as attribute_values',
        'product_variants.is_active as is_active',
        'products.is_active as product_is_active',
        'products.unit_of_measure_id as unit_of_measure_id',
        'units_of_measure.symbol as unit_of_measure_symbol',
        'products.tracking_type as tracking_type',
        'products.item_type as item_type',
        'products.category_id as category_id',
        'products.brand_id as brand_id',
        'products.sale_price_amount as sale_price_amount',
        'products.sale_price_currency as sale_price_currency',
        'products.purchase_price_amount as purchase_price_amount',
        'products.purchase_price_currency as purchase_price_currency',
        'products.tax_rule_id as tax_rule_id',
      ])
      .orderBy('products.name')
      .orderBy('product_variants.sku')
      .execute();
    const extras = await db
      .selectFrom('product_barcodes')
      .select(['product_variant_id', 'barcode', 'quantity', 'label'])
      .orderBy('created_at')
      .execute();
    const extrasByVariant = new Map<string, ProductVariantLookup['extraBarcodes']>();
    for (const extra of extras) {
      const list = extrasByVariant.get(extra.product_variant_id) ?? [];
      list.push({ barcode: extra.barcode, quantity: Number(extra.quantity), label: extra.label });
      extrasByVariant.set(extra.product_variant_id, list);
    }
    const unitsByProduct = await new KyselyProductUnitRepository().listAllForLookup(db);
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      extraBarcodes: extrasByVariant.get(row.id) ?? [],
      units: unitsByProduct.get(row.product_id) ?? [],
      productCode: row.product_code,
      productName: row.product_name,
      sku: row.sku,
      barcode: row.barcode,
      attributeValues: (row.attribute_values ?? {}) as Record<string, unknown>,
      isActive: row.is_active,
      productIsActive: row.product_is_active,
      unitOfMeasureId: row.unit_of_measure_id,
      unitOfMeasureSymbol: row.unit_of_measure_symbol,
      trackingType: row.tracking_type as ProductVariantLookup['trackingType'],
      itemType: row.item_type as ProductVariantLookup['itemType'],
      categoryId: row.category_id,
      brandId: row.brand_id,
      salePrice: money(row.sale_price_amount, row.sale_price_currency),
      purchasePrice: money(row.purchase_price_amount, row.purchase_price_currency),
      taxRuleId: row.tax_rule_id,
    }));
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariant | null> {
    const row = await db
      .updateTable('product_variants')
      .set({
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.attributeValues !== undefined ? { attribute_values: JSON.stringify(input.attributeValues) } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('product_variants').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
