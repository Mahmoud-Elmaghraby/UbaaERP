import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductRepository } from '../ports/product.repository';
import type { ProductVariantRepository } from '../ports/product-variant.repository';
import type { Product } from '../../domain/product.entity';
import type { ProductVariant } from '../../domain/product-variant.entity';
import { BusinessRuleError, ConflictError, NotFoundError } from '../errors';
import { ProductsService } from './products.service';
import type { ProductCodesService } from './product-codes.service';

const FAKE_TRX = { __trx: true } as unknown as Kysely<TenantDatabase>;
const FAKE_DB = {
  transaction: () => ({
    execute: (cb: (trx: Kysely<TenantDatabase>) => unknown) => cb(FAKE_TRX),
  }),
} as unknown as Kysely<TenantDatabase>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    code: 'PRD-1',
    name: 'T-Shirt',
    description: null,
    unitOfMeasureId: 'uom-1',
    trackVariants: false,
    trackingType: 'none',
    attributes: [],
    isActive: true,
    customFields: {},
    itemType: 'stock',
    categoryId: null,
    brandId: null,
    salePrice: null,
    purchasePrice: null,
    taxRuleId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    productId: 'product-1',
    sku: 'PRD-1',
    attributeValues: {},
    barcode: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockProductRepository(): jest.Mocked<ProductRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    hasStockMovements: jest.fn().mockResolvedValue(false),
  };
}

function makeMockVariantRepository(): jest.Mocked<ProductVariantRepository> {
  return {
    listLookup: jest.fn(),
    skuExists: jest.fn().mockResolvedValue(false),
    barcodeExists: jest.fn().mockResolvedValue(false),
    listByProductId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

function foreignKeyViolation(): Error {
  return Object.assign(new Error('insert or update on table violates foreign key constraint'), { code: '23503' });
}

describe('ProductsService', () => {
  let products: jest.Mocked<ProductRepository>;
  let variants: jest.Mocked<ProductVariantRepository>;
  let service: ProductsService;

  beforeEach(() => {
    products = makeMockProductRepository();
    variants = makeMockVariantRepository();
    // Codes stub: typed values pass through, nothing is auto-generated (manual mode).
    const codes = {
      resolveItemCode: jest.fn(async (_trx: unknown, typed?: string) => typed ?? 'AUTO-1'),
      resolveVariantSku: jest.fn(async (_trx: unknown, typed: string | undefined, code: string) => typed ?? code),
      resolveBarcode: jest.fn(async (_trx: unknown, typed?: string | null) => typed ?? null),
    } as unknown as ProductCodesService;
    service = new ProductsService(products, variants, codes);
  });

  describe('getById()', () => {
    it('returns the product with its variants', async () => {
      const product = makeProduct();
      const variant = makeVariant();
      products.findById.mockResolvedValue(product);
      variants.listByProductId.mockResolvedValue([variant]);

      await expect(service.getById(FAKE_DB, 'product-1')).resolves.toEqual({ ...product, variants: [variant] });
    });

    it('throws NotFoundError when the product does not exist', async () => {
      products.findById.mockResolvedValue(null);

      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('creates a default variant when trackVariants is false', async () => {
      const product = makeProduct({ trackVariants: false });
      const variant = makeVariant();
      products.create.mockResolvedValue(product);
      variants.create.mockResolvedValue(variant);

      const result = await service.create(FAKE_DB, {
        code: 'PRD-1',
        name: 'T-Shirt',
        unitOfMeasureId: 'uom-1',
      });

      expect(variants.create).toHaveBeenCalledWith(FAKE_TRX, { productId: product.id, sku: product.code, barcode: null });
      expect(result.variants).toEqual([variant]);
    });

    it('does not create a default variant when trackVariants is true', async () => {
      const product = makeProduct({ trackVariants: true });
      products.create.mockResolvedValue(product);

      const result = await service.create(FAKE_DB, {
        code: 'PRD-1',
        name: 'T-Shirt',
        unitOfMeasureId: 'uom-1',
        trackVariants: true,
      });

      expect(variants.create).not.toHaveBeenCalled();
      expect(result.variants).toEqual([]);
    });

    it('translates a unique-violation into ConflictError', async () => {
      products.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create(FAKE_DB, { code: 'DUP', name: 'X', unitOfMeasureId: 'uom-1' }),
      ).rejects.toThrow(ConflictError);
    });

    it('translates a foreign-key-violation on unitOfMeasureId into NotFoundError', async () => {
      products.create.mockRejectedValue(foreignKeyViolation());

      await expect(
        service.create(FAKE_DB, { code: 'X', name: 'X', unitOfMeasureId: 'missing-uom' }),
      ).rejects.toThrow(/Unit of measure "missing-uom" not found\./);
    });
  });

  describe('addVariant()', () => {
    it('adds a variant to an existing product', async () => {
      const product = makeProduct({ trackVariants: true });
      const variant = makeVariant({ sku: 'PRD-1-RED-L' });
      products.findById.mockResolvedValue(product);
      variants.listByProductId.mockResolvedValue([]);
      variants.create.mockResolvedValue(variant);

      await expect(
        service.addVariant(FAKE_DB, product.id, { sku: 'PRD-1-RED-L', attributeValues: { color: 'red' } }),
      ).resolves.toBe(variant);
    });

    it('throws NotFoundError when the product does not exist', async () => {
      products.findById.mockResolvedValue(null);

      await expect(service.addVariant(FAKE_DB, 'missing', { sku: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('translates a unique-violation on sku into ConflictError', async () => {
      const product = makeProduct();
      products.findById.mockResolvedValue(product);
      variants.listByProductId.mockResolvedValue([]);
      variants.create.mockRejectedValue(uniqueViolation());

      await expect(service.addVariant(FAKE_DB, product.id, { sku: 'DUP' })).rejects.toThrow(ConflictError);
    });
  });

  describe('delete()', () => {
    it('resolves when the repository reports a deletion', async () => {
      products.delete.mockResolvedValue(true);

      await expect(service.delete(FAKE_DB, 'product-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted', async () => {
      products.delete.mockResolvedValue(false);

      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('translates a foreign-key-violation (stock/documents reference it) into ConflictError', async () => {
      products.delete.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));

      await expect(service.delete(FAKE_DB, 'product-1')).rejects.toMatchObject({ code: 'PRODUCT.IN_USE' });
    });
  });

  describe('update() — stock-defining fields', () => {
    it('blocks changing the unit of measure once the product has stock movements', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.hasStockMovements.mockResolvedValue(true);

      await expect(service.update(FAKE_DB, 'product-1', { unitOfMeasureId: 'uom-2' })).rejects.toMatchObject({
        code: 'PRODUCT.UNIT_LOCKED_BY_STOCK',
      });
      expect(products.update).not.toHaveBeenCalled();
    });

    it('blocks changing the tracking type once the product has stock movements', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.hasStockMovements.mockResolvedValue(true);

      await expect(service.update(FAKE_DB, 'product-1', { trackingType: 'lot' })).rejects.toThrow(BusinessRuleError);
    });

    it('allows the change while the product has no stock movements', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.hasStockMovements.mockResolvedValue(false);
      products.update.mockResolvedValue(makeProduct({ unitOfMeasureId: 'uom-2' }));

      await expect(service.update(FAKE_DB, 'product-1', { unitOfMeasureId: 'uom-2' })).resolves.toMatchObject({
        unitOfMeasureId: 'uom-2',
      });
    });

    it('does not query movements when the unit/tracking are resent unchanged', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.update.mockResolvedValue(makeProduct({ name: 'Renamed' }));

      await service.update(FAKE_DB, 'product-1', { name: 'Renamed', unitOfMeasureId: 'uom-1', trackingType: 'none' });
      expect(products.hasStockMovements).not.toHaveBeenCalled();
    });
  });

  describe('updateVariant()', () => {
    it('updates the barcode of a variant that belongs to the product', async () => {
      variants.findById.mockResolvedValue(makeVariant());
      variants.update.mockResolvedValue(makeVariant({ barcode: '6221234567890' }));

      await expect(
        service.updateVariant(FAKE_DB, 'product-1', 'variant-1', { barcode: '6221234567890' }),
      ).resolves.toMatchObject({ barcode: '6221234567890' });
    });

    it('rejects a variant id that belongs to another product', async () => {
      variants.findById.mockResolvedValue(makeVariant({ productId: 'other-product' }));

      await expect(service.updateVariant(FAKE_DB, 'product-1', 'variant-1', { isActive: false })).rejects.toThrow(
        NotFoundError,
      );
      expect(variants.update).not.toHaveBeenCalled();
    });

    it('reports a duplicate barcode (not SKU) when the barcode unique key is violated', async () => {
      variants.findById.mockResolvedValue(makeVariant());
      variants.update.mockRejectedValue(
        Object.assign(new Error('dup'), { code: '23505', constraint: 'product_variants_barcode_unique' }),
      );

      await expect(
        service.updateVariant(FAKE_DB, 'product-1', 'variant-1', { barcode: '123' }),
      ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT.DUPLICATE_BARCODE' });
    });
  });
});
