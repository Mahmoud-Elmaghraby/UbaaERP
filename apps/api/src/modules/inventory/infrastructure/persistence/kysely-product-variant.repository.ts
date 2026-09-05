import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { ProductVariantsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductVariantRepository } from '../../application/ports/product-variant.repository';
import type {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
} from '../../domain/product-variant.entity';

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
        updated_at: new Date(),
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
