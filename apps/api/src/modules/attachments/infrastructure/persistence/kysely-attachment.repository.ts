import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { AttachmentsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AttachmentRepository } from '../../application/ports/attachment.repository';
import type { Attachment, AttachmentEntityType, CreateAttachmentInput } from '../../domain/attachment.entity';

function toDomain(row: Selectable<AttachmentsTable>): Attachment {
  return {
    id: row.id,
    entityType: row.entity_type as AttachmentEntityType,
    entityId: row.entity_id,
    fileName: row.file_name,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export class KyselyAttachmentRepository implements AttachmentRepository {
  async listForEntity(
    db: Kysely<TenantDatabase>,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<Attachment[]> {
    const rows = await db
      .selectFrom('attachments')
      .selectAll()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Attachment | null> {
    const row = await db.selectFrom('attachments').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateAttachmentInput): Promise<Attachment> {
    const row = await db
      .insertInto('attachments')
      .values({
        id: randomUUID(),
        entity_type: input.entityType,
        entity_id: input.entityId,
        file_name: input.fileName,
        storage_key: input.storageKey,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        uploaded_by: input.uploadedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('attachments').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
