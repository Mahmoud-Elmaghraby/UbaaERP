import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Attachment, AttachmentEntityType, CreateAttachmentInput } from '../../domain/attachment.entity';

export interface AttachmentRepository {
  listForEntity(
    db: Kysely<TenantDatabase>,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<Attachment[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Attachment | null>;
  create(db: Kysely<TenantDatabase>, input: CreateAttachmentInput): Promise<Attachment>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const ATTACHMENT_REPOSITORY = Symbol('ATTACHMENT_REPOSITORY');
