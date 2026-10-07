import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Item images (inventory completion, step 4 — CLAUDE.md §4: MinIO from the
 * Inventory module on). Several images per item like Odoo / Daftra, one of
 * them primary (shown in lists, the product picker and POS). An image may
 * belong to one variant (the red shirt) or to the whole item (NULL).
 *
 * Two objects per image: the full picture (≤ 1600 px, shown in the image
 * dialog) and a small thumbnail (≤ 320 px) for lists — both produced by the
 * browser before upload, so the server needs no image library. Keys are
 * tenant-prefixed in the shared bucket (shared/storage).
 */
const migration: TenantMigration = {
  name: '0085_product_images',
  async up(db) {
    await sql`
      CREATE TABLE product_images (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL,
        thumbnail_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order)`.execute(db);
    await sql`CREATE UNIQUE INDEX product_images_one_primary_uidx ON product_images (product_id) WHERE is_primary`.execute(db);
  },
};

export default migration;
