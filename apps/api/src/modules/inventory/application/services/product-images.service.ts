import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../../shared/storage/object-storage';
import { PRODUCT_IMAGE_REPOSITORY, type ProductImageRepository } from '../ports/product-image.repository';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_PER_PRODUCT,
  PRODUCT_IMAGE_MIME_TYPES,
  type ProductImage,
} from '../../domain/product-image.entity';
import { BusinessRuleError } from '../errors';

export interface UploadedImageFile {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface ProductImageWithUrls extends ProductImage {
  url: string;
  thumbnailUrl: string;
}

/** Image URLs are signed for 12 h and stay identical for an hour, so the browser caches them. */
const URL_EXPIRY_SECONDS = 12 * 60 * 60;
const URL_STABLE_SECONDS = 60 * 60;
const IMMUTABLE = 'private, max-age=31536000, immutable';

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Item images (migration 0085) in the shared object storage. */
@Injectable()
export class ProductImagesService {
  constructor(
    @Inject(PRODUCT_IMAGE_REPOSITORY) private readonly images: ProductImageRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async list(db: Kysely<TenantDatabase>, productId: string): Promise<ProductImageWithUrls[]> {
    await this.product(db, productId);
    return Promise.all((await this.images.listByProduct(db, productId)).map((image) => this.withUrls(image)));
  }

  /** productId → thumbnail URL of its primary image (all products, or the given ones). */
  async primaryThumbnailUrls(
    db: Kysely<TenantDatabase>,
    productIds?: readonly string[],
  ): Promise<Map<string, string>> {
    const primaries = await this.images.primaryByProducts(db, productIds);
    const entries = await Promise.all(
      primaries.map(async (image) => [image.productId, await this.url(image.thumbnailKey)] as const),
    );
    return new Map(entries);
  }

  async upload(
    db: Kysely<TenantDatabase>,
    schema: string,
    input: {
      productId: string;
      productVariantId?: string | null;
      image: UploadedImageFile;
      thumbnail?: UploadedImageFile | null;
      createdBy: string | null;
    },
  ): Promise<ProductImageWithUrls> {
    await this.product(db, input.productId);
    if (input.productVariantId) {
      const variant = await this.variants.findById(db, input.productVariantId);
      if (!variant || variant.productId !== input.productId) {
        throw entityNotFound('PRODUCT_VARIANT', input.productVariantId);
      }
    }
    for (const file of [input.image, input.thumbnail].filter((value): value is UploadedImageFile => Boolean(value))) {
      if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
        throw new BusinessRuleError(`Image type "${file.mimeType}" is not supported.`, {
          code: 'PRODUCT_IMAGE.TYPE_NOT_ALLOWED',
        });
      }
      if (file.sizeBytes > PRODUCT_IMAGE_MAX_BYTES) {
        throw new BusinessRuleError('The image is too large.', {
          code: 'PRODUCT_IMAGE.TOO_LARGE',
          params: { maxMb: PRODUCT_IMAGE_MAX_BYTES / 1024 / 1024 },
        });
      }
    }
    const existing = await this.images.listByProduct(db, input.productId);
    if (existing.length >= PRODUCT_IMAGE_MAX_PER_PRODUCT) {
      throw new BusinessRuleError('Too many images for this item.', {
        code: 'PRODUCT_IMAGE.TOO_MANY',
        params: { max: PRODUCT_IMAGE_MAX_PER_PRODUCT },
      });
    }

    const base = `${schema}/product/${input.productId}/${randomUUID()}`;
    const storageKey = `${base}.${EXTENSION[input.image.mimeType]}`;
    const thumbnail = input.thumbnail ?? input.image;
    const thumbnailKey = input.thumbnail ? `${base}-thumb.${EXTENSION[thumbnail.mimeType]}` : storageKey;
    await this.storage.put({
      key: storageKey,
      body: input.image.buffer,
      contentType: input.image.mimeType,
      cacheControl: IMMUTABLE,
    });
    if (thumbnailKey !== storageKey) {
      await this.storage.put({
        key: thumbnailKey,
        body: thumbnail.buffer,
        contentType: thumbnail.mimeType,
        cacheControl: IMMUTABLE,
      });
    }

    try {
      const image = await this.images.create(db, {
        productId: input.productId,
        productVariantId: input.productVariantId ?? null,
        storageKey,
        thumbnailKey,
        mimeType: input.image.mimeType,
        sizeBytes: input.image.sizeBytes,
        // The first image becomes the primary one.
        isPrimary: existing.length === 0,
        createdBy: input.createdBy,
      });
      return this.withUrls(image);
    } catch (err) {
      await this.removeObjects({ storageKey, thumbnailKey });
      throw err;
    }
  }

  async setPrimary(db: Kysely<TenantDatabase>, productId: string, imageId: string): Promise<ProductImageWithUrls[]> {
    await this.image(db, productId, imageId);
    await withTransaction(db, (trx) => this.images.setPrimary(trx, productId, imageId));
    return this.list(db, productId);
  }

  async reorder(db: Kysely<TenantDatabase>, productId: string, orderedIds: string[]): Promise<ProductImageWithUrls[]> {
    await withTransaction(db, (trx) => this.images.reorder(trx, productId, orderedIds));
    return this.list(db, productId);
  }

  /** Deleting the primary image promotes the next one. */
  async delete(db: Kysely<TenantDatabase>, productId: string, imageId: string): Promise<void> {
    const image = await this.image(db, productId, imageId);
    await withTransaction(db, async (trx) => {
      await this.images.delete(trx, imageId);
      if (image.isPrimary) {
        const next = (await this.images.listByProduct(trx, productId))[0];
        if (next) await this.images.setPrimary(trx, productId, next.id);
      }
    });
    await this.removeObjects(image);
  }

  /**
   * Storage clean-up when a product is deleted: take the snapshot before
   * deleting (the rows go with the FK cascade), remove the objects after
   * the delete succeeded — a refused delete (item in use) keeps its images.
   */
  snapshot(db: Kysely<TenantDatabase>, productId: string): Promise<ProductImage[]> {
    return this.images.listByProduct(db, productId);
  }

  async removeSnapshot(images: readonly ProductImage[]): Promise<void> {
    for (const image of images) await this.removeObjects(image);
  }

  private async removeObjects(image: { storageKey: string; thumbnailKey: string }): Promise<void> {
    await this.storage.delete(image.storageKey).catch(() => undefined);
    if (image.thumbnailKey !== image.storageKey) await this.storage.delete(image.thumbnailKey).catch(() => undefined);
  }

  private url(key: string): Promise<string> {
    return this.storage.presignedGetUrl(key, { expirySeconds: URL_EXPIRY_SECONDS, stableForSeconds: URL_STABLE_SECONDS });
  }

  private async withUrls(image: ProductImage): Promise<ProductImageWithUrls> {
    return { ...image, url: await this.url(image.storageKey), thumbnailUrl: await this.url(image.thumbnailKey) };
  }

  private async product(db: Kysely<TenantDatabase>, productId: string): Promise<void> {
    if (!(await this.products.findById(db, productId))) throw entityNotFound('PRODUCT', productId);
  }

  private async image(db: Kysely<TenantDatabase>, productId: string, imageId: string): Promise<ProductImage> {
    const image = await this.images.findById(db, imageId);
    if (!image || image.productId !== productId) throw entityNotFound('PRODUCT_IMAGE', imageId);
    return image;
  }
}
