/**
 * Central object storage (MinIO / S3) for every module that keeps files:
 * attachments, item images, and whatever comes next (logos, signed PDFs…).
 * One client, one bucket, keys always prefixed with the tenant schema so
 * tenants stay isolated the same way their database schemas are.
 */
export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** e.g. 'public, max-age=31536000, immutable' for content-addressed images. */
  cacheControl?: string;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<void>;
  /**
   * Presigned GET URL. `stableFor` (seconds) rounds the signing time down so
   * every request inside that window gets the SAME URL — the browser can
   * cache an image instead of re-downloading it on every list refresh.
   */
  presignedGetUrl(key: string, options?: { expirySeconds?: number; stableForSeconds?: number }): Promise<string>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
