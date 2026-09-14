import { Module } from '@nestjs/common';
import { ATTACHMENT_REPOSITORY } from './application/ports/attachment.repository';
import { ATTACHMENT_STORAGE_REPOSITORY } from './application/ports/attachment-storage.repository';
import { KyselyAttachmentRepository } from './infrastructure/persistence/kysely-attachment.repository';
import { MinioAttachmentStorageRepository } from './infrastructure/storage/minio-attachment-storage.repository';
import {
  MINIO_BUCKET,
  MINIO_CLIENT,
  createMinioClient,
  getAttachmentsBucketName,
} from './infrastructure/storage/minio-client.provider';
import { AttachmentsService } from './application/services/attachments.service';
import { AttachmentsController } from './presentation/attachments.controller';

/**
 * Shared Attachments feature (claude/attachments-strategy.md, backend
 * built 2026-09-12 — the frontend <AttachmentsPanel> is deliberately
 * deferred to a separate follow-up step, see that doc's "خطة التنفيذ"
 * section).
 *
 * Registered directly in AppModule, not owned by (or imported into) any
 * single business module — it's cross-cutting infrastructure used by
 * Sales, Purchases, and Inventory entity screens alike, the same way
 * MinIO itself was always meant to be shared platform infrastructure
 * (master doc §8.1 [مستقر]) rather than something Inventory alone owns.
 *
 * No PlanFeatureGuard and no new permission — see AttachmentsController's
 * and attachment.entity.ts's own class/file comments.
 *
 * TenantConnectionManager comes from the global TenancyModule — not
 * re-provided here, same as every other module.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [
    { provide: MINIO_CLIENT, useFactory: createMinioClient },
    { provide: MINIO_BUCKET, useFactory: getAttachmentsBucketName },
    { provide: ATTACHMENT_REPOSITORY, useClass: KyselyAttachmentRepository },
    { provide: ATTACHMENT_STORAGE_REPOSITORY, useClass: MinioAttachmentStorageRepository },
    AttachmentsService,
  ],
})
export class AttachmentsModule {}
