import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductTrackingKind, ProductTrackingReader } from '../../application/ports/product-tracking.reader';

export class KyselyProductTrackingReader implements ProductTrackingReader {
  async trackingTypes(
    db: Kysely<TenantDatabase>,
    productVariantIds: string[],
  ): Promise<Map<string, ProductTrackingKind>> {
    if (productVariantIds.length === 0) return new Map();
    const rows = await db
      .selectFrom('product_variants')
      .innerJoin('products', 'products.id', 'product_variants.product_id')
      .select(['product_variants.id as id', 'products.tracking_type as tracking_type'])
      .where('product_variants.id', 'in', [...new Set(productVariantIds)])
      .execute();
    return new Map(rows.map((row) => [row.id, row.tracking_type as ProductTrackingKind]));
  }
}
