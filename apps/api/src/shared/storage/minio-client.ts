import { Client as MinioClient } from 'minio';

export const MINIO_CLIENT = Symbol('MINIO_CLIENT');
export const MINIO_BUCKET = Symbol('MINIO_BUCKET');

/**
 * The single MinIO client configuration (env: MINIO_*). `region` is set
 * explicitly so presigning never needs a network round trip to discover it
 * (presigning a page of item thumbnails must stay a local computation).
 */
export function createMinioClient(): MinioClient {
  return new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'erp_minio',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'erp_minio_password',
    region: process.env.MINIO_REGION ?? 'us-east-1',
  });
}

export function getStorageBucketName(): string {
  return process.env.MINIO_ATTACHMENTS_BUCKET ?? 'erp-attachments';
}
