import { Client as MinioClient } from 'minio';

export const MINIO_CLIENT = Symbol('MINIO_CLIENT');
export const MINIO_BUCKET = Symbol('MINIO_BUCKET');

/**
 * MinIO connection settings (master doc §8.1 [مستقر]: "MinIO calls for
 * this starting with Inventory" — the decision predates this feature;
 * this is its first actual integration into any code path). All
 * optional with local-dev defaults matching docker-compose.yml's own
 * MinIO service defaults (MINIO_ROOT_USER/MINIO_ROOT_PASSWORD/
 * MINIO_PORT) — same "optional, defaulted in the consuming code" pattern
 * env.validation.ts already uses for JWT_ACCESS_TTL. Not hard-required
 * at boot: unlike Postgres, nothing touches MinIO before the first
 * attachment upload.
 */
export function createMinioClient(): MinioClient {
  return new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'erp_minio',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'erp_minio_password',
  });
}

export function getAttachmentsBucketName(): string {
  return process.env.MINIO_ATTACHMENTS_BUCKET ?? 'erp-attachments';
}
