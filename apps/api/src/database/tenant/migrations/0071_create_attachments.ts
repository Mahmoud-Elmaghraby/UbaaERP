import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * attachments (claude/attachments-strategy.md, approved 2026-09-12 — see
 * that doc for the full Odoo/ERPNext/SAP B1/Dolibarr comparison and the
 * 4 confirmed design decisions this migration encodes).
 *
 * Generic polymorphic attachment: (entity_type, entity_id) references a
 * row in one of several other tenant-schema tables, depending on
 * entity_type. Deliberately NOT a real foreign key on entity_id — a
 * single column pair can't target more than one table — so referential
 * integrity for the *pointed-at* row is left unenforced at the DB level,
 * matching the same unenforced convention Odoo (ir.attachment) and
 * ERPNext (the File doctype) use for this specific relationship (see the
 * strategy doc's research section).
 *
 * What IS enforced here, stricter than every one of those reference
 * systems: entity_type itself is constrained to the 7 types the user
 * confirmed for v1 ("كل الكيانات المذكورة") via a CHECK constraint,
 * mirroring the code-level whitelist in
 * apps/api/src/modules/attachments/domain/attachment.entity.ts
 * (ATTACHMENT_ENTITY_TYPES) and the independent Zod copy in
 * libs/contracts/src/attachments/attachment.contract.ts. Same idea for
 * mime_type (PDF + JPEG/PNG/WEBP only) and size_bytes (>0, and the
 * 10 MB ceiling is enforced in the application layer since a CHECK
 * constraint can't reference the shared ATTACHMENT_MAX_SIZE_BYTES
 * constant — kept here anyway as a sane upper bound against a
 * hypothetical future bypass of the application-layer check).
 *
 * uploaded_by IS a real FK to users — that table is never polymorphic.
 *
 * No new permission is inserted: Attachments reuses each OWNING module's
 * existing permission (sales.manage / purchases.manage /
 * inventory.manage) rather than introducing 'attachments.manage' — the
 * user's explicit choice ("صلاحية الموديول نفسه"). See
 * ATTACHMENT_ENTITY_PERMISSIONS in the domain entity file.
 */
const migration: TenantMigration = {
  name: '0071_create_attachments',
  async up(db) {
    await sql`
      CREATE TABLE attachments (
        id UUID PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id UUID NOT NULL,
        file_name TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT attachments_storage_key_unique UNIQUE (storage_key),
        CONSTRAINT attachments_entity_type_whitelist CHECK (
          entity_type IN (
            'sales_invoice', 'purchase_invoice', 'sales_order', 'purchase_order',
            'product', 'supplier', 'customer'
          )
        ),
        CONSTRAINT attachments_mime_type_whitelist CHECK (
          mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
        ),
        CONSTRAINT attachments_size_bytes_range CHECK (size_bytes > 0 AND size_bytes <= 10485760)
      )
    `.execute(db);

    await sql`
      CREATE INDEX attachments_entity_idx ON attachments (entity_type, entity_id)
    `.execute(db);
  },
};

export default migration;
