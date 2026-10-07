import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { ProductImagesService } from '../../src/modules/inventory/application/services/product-images.service';
import { KyselyProductImageRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-image.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import type { ObjectStorage, PutObjectInput } from '../../src/shared/storage/object-storage';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** In-memory object storage — the service only talks to the port. */
class FakeStorage implements ObjectStorage {
  readonly objects = new Map<string, PutObjectInput>();
  async put(input: PutObjectInput) {
    this.objects.set(input.key, input);
  }
  async presignedGetUrl(key: string) {
    return `https://storage.test/${key}`;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

describe('Product images (integration, real Postgres + fake storage)', () => {
  let db: Kysely<TenantDatabase>;
  let storage: FakeStorage;
  let images: ProductImagesService;
  const png = (size = 10) => ({ buffer: Buffer.alloc(size, 1), mimeType: 'image/png', sizeBytes: size });

  async function createProduct(): Promise<string> {
    const suffix = uniqueSuffix();
    const unitId = randomUUID();
    await db
      .insertInto('units_of_measure')
      .values({ id: unitId, name: `pc-${suffix}`, symbol: `pc${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    const productId = randomUUID();
    await db
      .insertInto('products')
      .values({
        id: productId,
        code: `IMG-${suffix}`,
        name: `Image product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: 'none',
        is_active: true,
        track_variants: false,
      })
      .execute();
    return productId;
  }

  beforeAll(() => {
    db = openIntegrationDb();
    storage = new FakeStorage();
    images = new ProductImagesService(
      new KyselyProductImageRepository(),
      new KyselyProductRepository(),
      new KyselyProductVariantRepository(),
      storage,
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('first image is primary; thumbnails are separate objects; deleting the primary promotes the next', async () => {
    const productId = await createProduct();
    const first = await images.upload(db, 'tenant_x', { productId, image: png(), thumbnail: png(4), createdBy: null });
    const second = await images.upload(db, 'tenant_x', { productId, image: png(), createdBy: null });
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
    expect(first.thumbnailKey).not.toBe(first.storageKey);
    expect(second.thumbnailKey).toBe(second.storageKey);
    expect(first.storageKey.startsWith(`tenant_x/product/${productId}/`)).toBe(true);
    expect(storage.objects.size).toBeGreaterThanOrEqual(3);

    const thumbs = await images.primaryThumbnailUrls(db, [productId]);
    expect(thumbs.get(productId)).toBe(`https://storage.test/${first.thumbnailKey}`);

    const reordered = await images.setPrimary(db, productId, second.id);
    expect(reordered[0]!.id).toBe(second.id);

    await images.delete(db, productId, second.id);
    const left = await images.list(db, productId);
    expect(left).toHaveLength(1);
    expect(left[0]!.isPrimary).toBe(true);
    expect(storage.objects.has(second.storageKey)).toBe(false);
  });

  it('rejects a non-image file', async () => {
    const productId = await createProduct();
    await expect(
      images.upload(db, 'tenant_x', {
        productId,
        image: { buffer: Buffer.from('%PDF'), mimeType: 'application/pdf', sizeBytes: 4 },
        createdBy: null,
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMAGE.TYPE_NOT_ALLOWED' });
  });
});
