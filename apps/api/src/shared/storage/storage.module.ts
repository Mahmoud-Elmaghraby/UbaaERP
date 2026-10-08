import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Client as MinioClient } from 'minio';
import { getStorageDriver } from '../config/deployment';
import { MINIO_BUCKET, MINIO_CLIENT, createMinioClient, getStorageBucketName } from './minio-client';
import { MinioObjectStorage } from './minio-object-storage';
import { LocalObjectStorage } from './local-object-storage';
import { LocalFilesController } from './local-files.controller';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';

/**
 * Global: any module injects OBJECT_STORAGE (and the raw client/bucket if it really needs them).
 *
 * The implementation behind OBJECT_STORAGE is picked once at boot
 * (shared/config/deployment.ts → getStorageDriver): MinIO for the cloud,
 * the local filesystem for the desktop build, which ships no MinIO.
 */
function createObjectStorage(client: MinioClient, bucket: string): ObjectStorage {
  if (getStorageDriver() === 'local') {
    const signingSecret = process.env.STORAGE_SIGNING_SECRET ?? process.env.JWT_ACCESS_SECRET;
    if (!signingSecret) {
      throw new Error('STORAGE_SIGNING_SECRET (or JWT_ACCESS_SECRET) is required for local file storage.');
    }
    return new LocalObjectStorage({
      rootDir: process.env.STORAGE_LOCAL_PATH ?? join(tmpdir(), 'erp-platform-storage'),
      signingSecret,
      publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
    });
  }
  return new MinioObjectStorage(client, bucket);
}

@Global()
@Module({
  controllers: [LocalFilesController],
  providers: [
    { provide: MINIO_CLIENT, useFactory: createMinioClient },
    { provide: MINIO_BUCKET, useFactory: getStorageBucketName },
    { provide: OBJECT_STORAGE, useFactory: createObjectStorage, inject: [MINIO_CLIENT, MINIO_BUCKET] },
  ],
  exports: [MINIO_CLIENT, MINIO_BUCKET, OBJECT_STORAGE],
})
export class StorageModule {}
