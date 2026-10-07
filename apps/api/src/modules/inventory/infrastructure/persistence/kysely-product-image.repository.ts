import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { ProductImagesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductImageRepository } from '../../application/ports/product-image.repository';
import type { ProductImage } from '../../domain/product-image.entity';

function toDomain(row: Selectable<ProductImagesTable>): ProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    productVariantId: row.product_variant_id,
    storageKey: row.storage_key,
    thumbnailKey: row.thumbnail_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class KyselyProductImageRepository implements ProductImageRepository {
  async listByProduct(db: Kysely<TenantDatabase>, productId: string): Promise<ProductImage[]> {
    const rows = await db
      .selectFrom('product_images')
      .selectAll()
      .where('product_id', '=', productId)
      .orderBy('is_primary', 'desc')
      .orderBy('sort_order')
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async primaryByProducts(db: Kysely<TenantDatabase>, productIds?: readonly string[]): Promise<ProductImage[]> {
    let query = db.selectFrom('product_images').selectAll().where('is_primary', '=', true);
    if (productIds) {
      if (productIds.length === 0) return [];
      query = query.where('product_id', 'in', [...productIds]);
    }
    return (await query.execute()).map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<ProductImage | null> {
    const row = await db.selectFrom('product_images').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: Omit<ProductImage, 'id' | 'createdAt' | 'sortOrder'>,
  ): Promise<ProductImage> {
    const row = await db
      .insertInto('product_images')
      .values({
        id: randomUUID(),
        product_id: input.productId,
        product_variant_id: input.productVariantId,
        storage_key: input.storageKey,
        thumbnail_key: input.thumbnailKey,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        is_primary: input.isPrimary,
        sort_order: sql<number>`COALESCE((SELECT MAX(sort_order) + 1 FROM product_images WHERE product_id = ${input.productId}), 0)`,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.deleteFrom('product_images').where('id', '=', id).execute();
  }

  async setPrimary(db: Kysely<TenantDatabase>, productId: string, imageId: string): Promise<void> {
    // Clear first: the partial unique index allows one primary per product.
    await db.updateTable('product_images').set({ is_primary: false }).where('product_id', '=', productId).execute();
    await db
      .updateTable('product_images')
      .set({ is_primary: true })
      .where('id', '=', imageId)
      .where('product_id', '=', productId)
      .execute();
  }

  async reorder(db: Kysely<TenantDatabase>, productId: string, orderedIds: string[]): Promise<void> {
    for (const [index, id] of orderedIds.entries()) {
      await db
        .updateTable('product_images')
        .set({ sort_order: index })
        .where('id', '=', id)
        .where('product_id', '=', productId)
        .execute();
    }
  }
}
