import { z } from 'zod';

/**
 * Shared Attachments feature (claude/attachments-strategy.md, confirmed
 * 2026-09-12). This entity-type list is intentionally a SEPARATE literal
 * from apps/api's ATTACHMENT_ENTITY_TYPES
 * (apps/api/src/modules/attachments/domain/attachment.entity.ts) — the
 * same convention moneySchema already uses for the Money Value Object
 * (see money.contract.ts's header comment): a wire-format Zod schema is
 * kept independently in sync with its domain counterpart, rather than
 * the domain layer importing a Zod-based library, or this library
 * importing the domain layer (blocked outright by the ESLint
 * `boundaries` rule anyway — libs/* must never import apps/*). Keep both
 * lists identical whenever either changes.
 */
export const attachmentEntityTypeSchema = z.enum([
  'sales_invoice',
  'purchase_invoice',
  'sales_order',
  'purchase_order',
  'product',
  'supplier',
  'customer',
]);
export type AttachmentEntityTypeDto = z.infer<typeof attachmentEntityTypeSchema>;

export const attachmentSchema = z.object({
  id: z.string().uuid(),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().uuid(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  uploadedBy: z.string().uuid(),
  createdAt: z.coerce.date(),
});
export type AttachmentDto = z.infer<typeof attachmentSchema>;

/**
 * Validates the non-file multipart fields of POST /attachments only —
 * the file itself arrives via FileInterceptor/@UploadedFile(), never
 * through @Body(), so it has no place in this schema. multer still
 * populates the plain-text fields onto req.body before Nest's pipes run,
 * so ZodValidationPipe applies to this exactly like it would to a plain
 * JSON body.
 */
export const createAttachmentSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().uuid(),
});
export type CreateAttachmentDto = z.infer<typeof createAttachmentSchema>;

export const listAttachmentsQuerySchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().uuid(),
});
export type ListAttachmentsQueryDto = z.infer<typeof listAttachmentsQuerySchema>;

/**
 * Response shape for GET /attachments/:id/download-url — a presigned
 * MinIO URL (user's explicit choice: "روابط presigned من الأول"), valid
 * until expiresAt with no mid-flight revocation. See
 * ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS in the domain entity file.
 */
export const attachmentDownloadUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.coerce.date(),
});
export type AttachmentDownloadUrlDto = z.infer<typeof attachmentDownloadUrlSchema>;
