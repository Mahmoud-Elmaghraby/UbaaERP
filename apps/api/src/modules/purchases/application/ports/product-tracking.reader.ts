import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export type ProductTrackingKind = 'none' | 'lot' | 'serial';

/**
 * Read-only lookup of each variant's tracking type, so a goods receipt can
 * be rejected up front when a lot/serial-tracked line has no lots — instead
 * of being confirmed and then failing inside Inventory's listener (stock
 * that never arrives). A plain read of reference data the purchase lines
 * already point at by FK (same precedent as product_variant_id FKs across
 * modules); it triggers no Inventory behaviour, so CLAUDE.md §2.6 holds.
 */
export interface ProductTrackingReader {
  trackingTypes(db: Kysely<TenantDatabase>, productVariantIds: string[]): Promise<Map<string, ProductTrackingKind>>;
}

export const PRODUCT_TRACKING_READER = Symbol('PRODUCT_TRACKING_READER');
