import { Inject, Injectable } from '@nestjs/common';
import type {
  AttachmentStorageRepository,
  UploadObjectInput,
} from '../../application/ports/attachment-storage.repository';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../../shared/storage/object-storage';

/**
 * Attachments' storage port, backed by the shared object storage
 * (shared/storage — one MinIO client and bucket for every module; item
 * images use the same one). Bucket creation lives there too.
 */
@Injectable()
export class MinioAttachmentStorageRepository implements AttachmentStorageRepository {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  upload(input: UploadObjectInput): Promise<void> {
    return this.storage.put({ key: input.key, body: input.body, contentType: input.contentType });
  }

  getPresignedDownloadUrl(key: string, expirySeconds: number): Promise<string> {
    return this.storage.presignedGetUrl(key, { expirySeconds });
  }

  delete(key: string): Promise<void> {
    return this.storage.delete(key);
  }
}
