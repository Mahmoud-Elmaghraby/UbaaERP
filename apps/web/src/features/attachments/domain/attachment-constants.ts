import type { AttachmentEntityTypeDto } from '@erp-platform/contracts';

/**
 * Frontend-side mirror of apps/api's ATTACHMENT_ENTITY_PERMISSIONS /
 * ATTACHMENT_MAX_SIZE_BYTES / ATTACHMENT_ALLOWED_MIME_TYPES
 * (apps/api/src/modules/attachments/domain/attachment.entity.ts).
 *
 * Kept in sync manually — the same "independent copy" convention already
 * used for the entity-type whitelist itself (see
 * libs/contracts/src/attachments/attachment.contract.ts's header comment,
 * and money.contract.ts before it): apps/web can't import from apps/api,
 * and there's no shared lib both layers already depend on for this. Update
 * all three places together if the backend's rules ever change.
 *
 * Used to (1) gate the whole <AttachmentsPanel> behind the same permission
 * the owning module's other manage actions require — the backend's own
 * GET /attachments also enforces this, so a user without it can't even
 * list attachments — and (2) reject an obviously-too-large or
 * wrong-type file client-side before spending an upload round-trip; the
 * backend still re-validates both independently and is the real authority.
 */
export const ATTACHMENT_ENTITY_PERMISSIONS: Record<AttachmentEntityTypeDto, string> = {
  sales_invoice: 'sales.manage',
  sales_order: 'sales.manage',
  customer: 'sales.manage',
  purchase_invoice: 'purchases.manage',
  purchase_order: 'purchases.manage',
  supplier: 'purchases.manage',
  product: 'inventory.manage',
};

export const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

export function isAttachmentAllowedMimeType(value: string): boolean {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** <input accept>. ".pdf" by extension is included alongside the MIME type
 * because some browsers/OSes don't map application/pdf reliably from the
 * native file picker's filter. */
export const ATTACHMENT_ACCEPT_ATTR = '.pdf,image/jpeg,image/png,image/webp';
