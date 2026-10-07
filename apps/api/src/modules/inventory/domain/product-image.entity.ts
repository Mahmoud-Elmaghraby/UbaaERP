export interface ProductImage {
  id: string;
  productId: string;
  productVariantId: string | null;
  storageKey: string;
  thumbnailKey: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: Date;
}

/** JPEG / PNG / WebP only; the browser re-encodes before upload, so 5 MB is generous. */
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_PER_PRODUCT = 12;
