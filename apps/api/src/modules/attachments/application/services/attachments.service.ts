import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS,
  isAttachmentAllowedMimeType,
  type Attachment,
  type AttachmentEntityType,
} from '../../domain/attachment.entity';
import { ATTACHMENT_REPOSITORY, type AttachmentRepository } from '../ports/attachment.repository';
import {
  ATTACHMENT_STORAGE_REPOSITORY,
  type AttachmentStorageRepository,
} from '../ports/attachment-storage.repository';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

export interface UploadAttachmentInput {
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  uploadedBy: string;
}

/**
 * Strips path separators and collapses whitespace — the original file
 * name is kept verbatim in the DB (file_name) for display, but only this
 * sanitized form is ever used inside the MinIO object key itself.
 */
function sanitizeFileNameForKey(fileName: string): string {
  return fileName.replace(/[/\\]/g, '_').replace(/\s+/g, '_');
}

/**
 * Application service for the shared Attachments feature
 * (claude/attachments-strategy.md). Deliberately does NOT go through the
 * Event Bus or Outbox (CLAUDE.md §2.6/§2.7) — an attachment upload/
 * delete is not a financial event and no other module reacts to it, so
 * this stays a plain cross-cutting service, closer to Inventory's simple
 * master-data entities than to a financial document.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY) private readonly repository: AttachmentRepository,
    @Inject(ATTACHMENT_STORAGE_REPOSITORY) private readonly storage: AttachmentStorageRepository,
  ) {}

  list(db: Kysely<TenantDatabase>, entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> {
    return this.repository.listForEntity(db, entityType, entityId);
  }

  /** Used by the controller both to authorize download/delete (the
   * required permission depends on the attachment's entityType, only
   * known once the row is fetched) and to avoid a second DB round trip
   * for the action itself. */
  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Attachment> {
    const attachment = await this.repository.findById(db, id);
    if (!attachment) throw entityNotFound('ATTACHMENT', id);
    return attachment;
  }

  async upload(db: Kysely<TenantDatabase>, schema: string, input: UploadAttachmentInput): Promise<Attachment> {
    if (input.sizeBytes > ATTACHMENT_MAX_SIZE_BYTES) {
      throw new BusinessRuleError(
        `Attachment size ${input.sizeBytes} exceeds the ${ATTACHMENT_MAX_SIZE_BYTES}-byte limit.`,
        { code: 'ATTACHMENT.FILE_TOO_LARGE', params: { maxSizeBytes: ATTACHMENT_MAX_SIZE_BYTES } },
      );
    }
    if (!isAttachmentAllowedMimeType(input.mimeType)) {
      throw new BusinessRuleError(`MIME type "${input.mimeType}" is not allowed for attachments.`, {
        code: 'ATTACHMENT.MIME_TYPE_NOT_ALLOWED',
        params: { mimeType: input.mimeType },
      });
    }

    // schema-prefixed key mirrors the schema-per-tenant DB isolation
    // philosophy in a single shared MinIO bucket (claude/attachments-strategy.md).
    const storageKey = `${schema}/${input.entityType}/${input.entityId}/${randomUUID()}-${sanitizeFileNameForKey(input.fileName)}`;
    await this.storage.upload({ key: storageKey, body: input.buffer, contentType: input.mimeType });

    try {
      return await this.repository.create(db, {
        entityType: input.entityType,
        entityId: input.entityId,
        fileName: input.fileName,
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: input.uploadedBy,
      });
    } catch (err) {
      // The DB write failed after the object was already uploaded to
      // MinIO — clean up the orphan rather than leaking storage forever.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async getDownloadUrl(attachment: Attachment): Promise<{ url: string; expiresAt: Date }> {
    const url = await this.storage.getPresignedDownloadUrl(
      attachment.storageKey,
      ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS,
    );
    return { url, expiresAt: new Date(Date.now() + ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }

  async delete(db: Kysely<TenantDatabase>, attachment: Attachment): Promise<void> {
    await this.repository.delete(db, attachment.id);
    await this.storage.delete(attachment.storageKey);
  }
}
