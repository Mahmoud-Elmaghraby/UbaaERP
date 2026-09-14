import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Client as MinioClient } from 'minio';
import type {
  AttachmentStorageRepository,
  UploadObjectInput,
} from '../../application/ports/attachment-storage.repository';
import { MINIO_BUCKET, MINIO_CLIENT } from './minio-client.provider';

/**
 * MinIO-backed implementation of the storage port. One shared bucket for
 * every tenant, with the tenant schema name as the first path segment of
 * the object key (AttachmentsService.upload builds the key) — mirrors
 * the schema-per-tenant DB isolation philosophy without the operational
 * overhead of provisioning a bucket per tenant (see
 * claude/attachments-strategy.md's storage-isolation research section).
 *
 * ensureBucketExists() runs once at module init (OnModuleInit) rather
 * than lazily on every upload, so a misconfigured bucket/credentials
 * fails fast in the logs instead of surfacing on a tenant's first
 * upload attempt.
 */
@Injectable()
export class MinioAttachmentStorageRepository implements AttachmentStorageRepository, OnModuleInit {
  private readonly logger = new Logger(MinioAttachmentStorageRepository.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket "${this.bucket}" for attachments.`);
      }
    } catch (err) {
      // Don't crash boot over MinIO being unreachable at startup (dev
      // environments where docker-compose hasn't started it yet) — the
      // first actual upload will surface a clear error instead.
      this.logger.warn(
        `Could not verify/create MinIO bucket "${this.bucket}" at startup: ${(err as Error).message}`,
      );
    }
  }

  async upload(input: UploadObjectInput): Promise<void> {
    await this.client.putObject(this.bucket, input.key, input.body, input.body.length, {
      'Content-Type': input.contentType,
    });
  }

  async getPresignedDownloadUrl(key: string, expirySeconds: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
