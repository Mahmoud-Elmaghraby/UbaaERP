/**
 * Shared Attachments feature — generic file attachments for any of 7
 * whitelisted entity types (claude/attachments-strategy.md, confirmed
 * 2026-09-12: "كل الكيانات المذكورة"). Unlike Odoo/ERPNext/Dolibarr,
 * which let a file attach to literally any model with no restriction,
 * this whitelist is enforced here in code AND mirrored as a DB CHECK
 * constraint (migration 0071) — a deliberate stricter choice than every
 * open-source ERP studied in the research pass.
 *
 * ATTACHMENT_ENTITY_TYPES is this feature's single source of truth.
 * libs/contracts/src/attachments/attachment.contract.ts keeps its own
 * z.enum(...) copy in sync manually — the same convention already
 * established for the Money Value Object (see money.contract.ts's header
 * comment): the domain layer never imports a Zod-based library, and
 * libs/* can never import apps/* (ESLint `boundaries` rule), so this
 * literal can't live in one place and be imported by the other without
 * introducing a cross-lib dependency this codebase doesn't otherwise
 * have. Keep both lists identical whenever either changes.
 */
export const ATTACHMENT_ENTITY_TYPES = [
  'sales_invoice',
  'purchase_invoice',
  'sales_order',
  'purchase_order',
  'product',
  'supplier',
  'customer',
] as const;

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Permission required to manage attachments on a given entity type —
 * reuses each OWNING module's existing permission rather than
 * introducing a new 'attachments.manage' permission (the user's explicit
 * choice, claude/attachments-strategy.md: "صلاحية الموديول نفسه"). Cross-
 * checked directly against each controller's own
 * @RequirePermissions(...): suppliers.controller.ts and the Purchases
 * order/invoice controllers require 'purchases.manage'; customers.
 * controller.ts and the Sales order/invoice controllers require
 * 'sales.manage'; products.controller.ts requires 'inventory.products.manage' (migration 0082).
 */
export const ATTACHMENT_ENTITY_PERMISSIONS: Record<AttachmentEntityType, string> = {
  sales_invoice: 'sales.manage',
  sales_order: 'sales.manage',
  customer: 'sales.manage',
  purchase_invoice: 'purchases.manage',
  purchase_order: 'purchases.manage',
  supplier: 'purchases.manage',
  product: 'inventory.products.manage',
};

/** 10 MB — the user's confirmed limit (claude/attachments-strategy.md). */
export const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** PDF + the 3 raster image formats — the user's confirmed limit. */
export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AttachmentAllowedMimeType = (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

export function isAttachmentAllowedMimeType(value: string): value is AttachmentAllowedMimeType {
  return (ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Presigned download URL TTL — 5 minutes. The user explicitly chose
 * presigned URLs over a backend-proxy download ("روابط presigned من
 * الأول", overriding this session's own recommendation) — a known,
 * accepted trade-off: once issued, the URL is a bearer-token-like
 * credential valid until it expires, with no mid-flight revocation.
 */
export const ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS = 300;

export interface Attachment {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: Date;
}

export interface CreateAttachmentInput {
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}
