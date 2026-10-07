import { Global, Module } from '@nestjs/common';
import { MINIO_BUCKET, MINIO_CLIENT, createMinioClient, getStorageBucketName } from './minio-client';
import { MinioObjectStorage } from './minio-object-storage';
import { OBJECT_STORAGE } from './object-storage';

/** Global: any module injects OBJECT_STORAGE (and the raw client/bucket if it really needs them). */
@Global()
@Module({
  providers: [
    { provide: MINIO_CLIENT, useFactory: createMinioClient },
    { provide: MINIO_BUCKET, useFactory: getStorageBucketName },
    { provide: OBJECT_STORAGE, useClass: MinioObjectStorage },
  ],
  exports: [MINIO_CLIENT, MINIO_BUCKET, OBJECT_STORAGE],
})
export class StorageModule {}
