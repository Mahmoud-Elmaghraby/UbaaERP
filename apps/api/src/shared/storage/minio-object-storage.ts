import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Client as MinioClient } from 'minio';
import type { ObjectStorage, PutObjectInput } from './object-storage';
import { MINIO_BUCKET, MINIO_CLIENT } from './minio-client';

@Injectable()
export class MinioObjectStorage implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(MinioObjectStorage.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket "${this.bucket}".`);
      }
    } catch (err) {
      // Never block boot on MinIO (dev without docker-compose up); the first upload reports it.
      this.logger.warn(`Could not verify/create MinIO bucket "${this.bucket}": ${(err as Error).message}`);
    }
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.putObject(this.bucket, input.key, input.body, input.body.length, {
      'Content-Type': input.contentType,
      ...(input.cacheControl ? { 'Cache-Control': input.cacheControl } : {}),
    });
  }

  async presignedGetUrl(
    key: string,
    options: { expirySeconds?: number; stableForSeconds?: number } = {},
  ): Promise<string> {
    const expiry = options.expirySeconds ?? 300;
    const stable = options.stableForSeconds ?? 0;
    const now = Date.now();
    const requestDate = stable > 0 ? new Date(now - (now % (stable * 1000))) : new Date(now);
    return this.client.presignedGetObject(this.bucket, key, expiry, {}, requestDate);
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
