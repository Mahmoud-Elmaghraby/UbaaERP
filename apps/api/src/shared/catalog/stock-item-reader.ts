import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/**
 * Read-only: which of these product variants are stock items (not
 * services). Used outside Inventory — Accounting splits a purchase
 * invoice between "goods received not invoiced" (stock lines, already
 * valued by the goods receipt) and purchase expense (service lines).
 * Same read-only catalogue precedent as ProductUnitResolver.
 */
export async function stockItemVariantIds(
  db: Kysely<TenantDatabase>,
  productVariantIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(productVariantIds)];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectFrom('product_variants')
    .innerJoin('products', 'products.id', 'product_variants.product_id')
    .select('product_variants.id as id')
    .where('product_variants.id', 'in', ids)
    .where('products.item_type', '<>', 'service')
    .execute();
  return new Set(rows.map((row) => row.id));
}
