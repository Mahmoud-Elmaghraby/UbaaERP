/**
 * Object-storage port (Clean Architecture — the application layer never
 * depends on the `minio` package directly; see
 * infrastructure/storage/minio-attachment-storage.repository.ts for the
 * concrete implementation).
 */
export interface UploadObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface AttachmentStorageRepository {
  upload(input: UploadObjectInput): Promise<void>;
  /** Returns a presigned GET URL valid for `expirySeconds` — the user's
   * explicit choice over a backend-proxy download (see the domain
   * entity's ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS comment). */
  getPresignedDownloadUrl(key: string, expirySeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const ATTACHMENT_STORAGE_REPOSITORY = Symbol('ATTACHMENT_STORAGE_REPOSITORY');
