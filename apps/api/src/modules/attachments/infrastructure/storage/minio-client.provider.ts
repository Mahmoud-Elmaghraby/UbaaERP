/**
 * Moved to shared/storage (inventory step 4: item images use the same
 * client and bucket). Re-exported so existing imports keep working.
 */
export {
  MINIO_BUCKET,
  MINIO_CLIENT,
  createMinioClient,
  getStorageBucketName as getAttachmentsBucketName,
} from '../../../../shared/storage/minio-client';
