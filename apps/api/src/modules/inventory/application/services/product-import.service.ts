import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { DomainError, LEGACY_ERROR_CODE } from '../../../../shared/errors/domain-errors';
import { AR_MESSAGES, formatArMessage } from '../../../../shared/errors/error-messages.ar';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import type { ProductItemType, ProductTrackingType } from '../../domain/product.entity';
import { BusinessRuleError } from '../errors';
import { ProductsService } from './products.service';
import { ProductCatalogService } from './product-catalog.service';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { StockCountsService } from './stock-counts.service';

/** One spreadsheet row, already mapped to fields by the browser (raw text, as typed). */
export interface ProductImportRow {
  rowNumber: number;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  unit?: string | null;
  itemType?: string | null;
  trackingType?: string | null;
  salePrice?: string | null;
  purchasePrice?: string | null;
  isActive?: string | null;
  openingQuantity?: string | null;
  openingCost?: string | null;
}

export interface ProductImportOptions {
  /** create = new codes only (existing → error); upsert = update items whose code exists. */
  mode: 'create' | 'upsert';
  dryRun: boolean;
  /** Import the valid rows and report the rest, instead of all-or-nothing. */
  skipInvalid: boolean;
  createMissingCategories: boolean;
  createMissingBrands: boolean;
  createMissingUnits: boolean;
  /** When rows carry opening quantities: the warehouse of the draft opening balance created for them. */
  openingWarehouseId?: string | null;
}

export interface ProductImportRowResult {
  rowNumber: number;
  status: 'create' | 'update' | 'error';
  code: string | null;
  name: string | null;
  errors: { field: string; message: string }[];
  productId: string | null;
}

export interface ProductImportResult {
  dryRun: boolean;
  committed: boolean;
  created: number;
  updated: number;
  failed: number;
  /** Draft opening balance created for the opening quantities (only when committed). */
  openingCountId: string | null;
  rows: ProductImportRowResult[];
}

export const PRODUCT_IMPORT_MAX_ROWS = 5000;

class RowError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

class Rollback extends Error {}

const ITEM_TYPES: Record<string, ProductItemType> = {
  stock: 'stock',
  'مخزني': 'stock',
  'مخزنى': 'stock',
  'صنف': 'stock',
  'منتج': 'stock',
  service: 'service',
  'خدمة': 'service',
  'خدمه': 'service',
};
const TRACKING: Record<string, ProductTrackingType> = {
  none: 'none',
  'بدون': 'none',
  'لا': 'none',
  lot: 'lot',
  batch: 'lot',
  'دفعة': 'lot',
  'دفعه': 'lot',
  'تشغيلة': 'lot',
  serial: 'serial',
  'تسلسلي': 'serial',
  'سيريال': 'serial',
};
const BOOLEAN: Record<string, boolean> = {
  '1': true,
  '0': false,
  yes: true,
  no: false,
  true: true,
  false: false,
  'نعم': true,
  'لا': false,
  'نشط': true,
  'غير نشط': false,
  'موقوف': false,
};

/** Arabic-Indic digits → ASCII, Arabic decimal/thousands separators normalised. */
function westernDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

function clean(value: string | null | undefined): string | null {
  const text = value?.toString().trim();
  return text ? text : null;
}

/** "Arabic spelling tolerant" key for matching names (أ/إ/آ→ا, ة→ه, ى→ي, case, spaces). */
function nameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '')
    .replace(/\s+/g, ' ');
}

function parseDecimal(value: string, field: string): number {
  const text = westernDigits(value).replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new RowError(field, 'رقم غير صحيح');
  return Number(text);
}

function parseMoney(value: string | null, currency: string, field: string): Money | null {
  if (!value) return null;
  const text = westernDigits(value).replace(/,/g, '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RowError(field, 'مبلغ غير صحيح (رقم موجب بحد أقصى خانتين عشريتين)');
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return Money.fromMinorUnits(minor, currency);
}

/**
 * Excel import of the item master (استيراد الأصناف). The browser reads the
 * file and maps columns; this service validates every row exactly like the
 * product form would (same ProductsService.create/update), resolving
 * category / brand / unit by name (Arabic-spelling tolerant) and optionally
 * creating the missing ones.
 *
 * Everything runs in ONE transaction with a savepoint per row, so a dry run
 * ("test import", Odoo-style) executes the real code and then rolls back,
 * and a real run is all-or-nothing unless `skipInvalid` is on. Opening
 * quantities, when present, become a draft opening balance (OPN-) for the
 * chosen warehouse — reviewed and posted from the usual screen, never
 * posted behind the user's back.
 */
@Injectable()
export class ProductImportService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    private readonly productsService: ProductsService,
    private readonly catalog: ProductCatalogService,
    private readonly units: UnitsOfMeasureService,
    private readonly counts: StockCountsService,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  async import(
    db: Kysely<TenantDatabase>,
    rows: ProductImportRow[],
    options: ProductImportOptions,
    actorUserId: string | null,
  ): Promise<ProductImportResult> {
    if (rows.length === 0) {
      throw new BusinessRuleError('The file has no rows.', { code: 'PRODUCT_IMPORT.EMPTY' });
    }
    if (rows.length > PRODUCT_IMPORT_MAX_ROWS) {
      throw new BusinessRuleError('Too many rows.', {
        code: 'PRODUCT_IMPORT.TOO_MANY_ROWS',
        params: { max: PRODUCT_IMPORT_MAX_ROWS },
      });
    }
    const hasOpening = rows.some((row) => clean(row.openingQuantity));
    if (hasOpening && !options.openingWarehouseId) {
      throw new BusinessRuleError('Choose the warehouse for the opening quantities.', {
        code: 'PRODUCT_IMPORT.OPENING_WAREHOUSE_REQUIRED',
      });
    }

    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const results: ProductImportRowResult[] = [];
    let openingCountId: string | null = null;
    let committed = false;

    try {
      await withTransaction(db, async (trx) => {
        const lookups = await this.lookups(trx);
        const seenCodes = new Set<string>();
        const openingLines: { productVariantId: string; quantity: number; cost: Money | null }[] = [];

        for (const row of rows) {
          await sql`SAVEPOINT import_row`.execute(trx);
          const result: ProductImportRowResult = {
            rowNumber: row.rowNumber,
            status: 'create',
            code: clean(row.code),
            name: clean(row.name),
            errors: [],
            productId: null,
          };
          try {
            const outcome = await this.importRow(trx, row, options, currency, lookups, seenCodes);
            result.status = outcome.status;
            result.productId = outcome.productId;
            result.code = outcome.code;
            if (outcome.opening) openingLines.push({ productVariantId: outcome.variantId, ...outcome.opening });
            await sql`RELEASE SAVEPOINT import_row`.execute(trx);
          } catch (err) {
            await sql`ROLLBACK TO SAVEPOINT import_row`.execute(trx);
            await sql`RELEASE SAVEPOINT import_row`.execute(trx);
            result.status = 'error';
            result.errors.push(this.describe(err));
          }
          results.push(result);
        }

        const failed = results.some((result) => result.status === 'error');
        if (options.dryRun || (failed && !options.skipInvalid)) throw new Rollback();

        if (openingLines.length > 0 && options.openingWarehouseId) {
          const count = await this.counts.create(
            trx,
            { kind: 'opening', warehouseId: options.openingWarehouseId, notes: 'استيراد الأصناف من Excel' },
            actorUserId,
          );
          await this.counts.upsertLines(
            trx,
            count.id,
            openingLines.map((line) => ({
              productVariantId: line.productVariantId,
              countedQuantity: line.quantity,
              unitCost: line.cost,
            })),
          );
          openingCountId = count.id;
        }
        committed = true;
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }

    return {
      dryRun: options.dryRun,
      committed,
      created: results.filter((result) => result.status === 'create').length,
      updated: results.filter((result) => result.status === 'update').length,
      failed: results.filter((result) => result.status === 'error').length,
      openingCountId: committed ? openingCountId : null,
      rows: results,
    };
  }

  private async importRow(
    trx: Kysely<TenantDatabase>,
    row: ProductImportRow,
    options: ProductImportOptions,
    currency: string,
    lookups: Awaited<ReturnType<ProductImportService['lookups']>>,
    seenCodes: Set<string>,
  ): Promise<{
    status: 'create' | 'update';
    productId: string;
    variantId: string;
    code: string;
    opening: { quantity: number; cost: Money | null } | null;
  }> {
    const code = clean(row.code);
    const name = clean(row.name);
    if (code) {
      const key = code.toLowerCase();
      if (seenCodes.has(key)) throw new RowError('code', 'الكود مكرر داخل الملف');
      seenCodes.add(key);
    }
    const existing = code ? await this.products.findByCode(trx, code) : null;
    if (existing && options.mode === 'create') throw new RowError('code', 'يوجد صنف بنفس الكود بالفعل');
    if (!existing && !name) throw new RowError('name', 'اسم الصنف مطلوب');

    const itemTypeText = clean(row.itemType);
    const itemType = itemTypeText ? ITEM_TYPES[nameKey(itemTypeText)] : undefined;
    if (itemTypeText && !itemType) throw new RowError('itemType', 'نوع الصنف يجب أن يكون "مخزني" أو "خدمة"');
    const trackingText = clean(row.trackingType);
    const trackingType = trackingText ? TRACKING[nameKey(trackingText)] : undefined;
    if (trackingText && !trackingType) throw new RowError('trackingType', 'التتبع يجب أن يكون "بدون" أو "دفعة" أو "تسلسلي"');
    const activeText = clean(row.isActive);
    const isActive = activeText ? BOOLEAN[nameKey(activeText)] : undefined;
    if (activeText && isActive === undefined) throw new RowError('isActive', 'الحالة يجب أن تكون "نعم" أو "لا"');

    const unitText = clean(row.unit);
    let unitOfMeasureId: string | undefined;
    if (unitText) unitOfMeasureId = await this.unitId(trx, unitText, options, lookups);
    else if (!existing) unitOfMeasureId = lookups.defaultUnitId ?? undefined;
    if (!existing && !unitOfMeasureId) throw new RowError('unit', 'وحدة القياس مطلوبة');

    const categoryText = clean(row.category);
    const categoryId = categoryText ? await this.categoryId(trx, categoryText, options, lookups) : undefined;
    const brandText = clean(row.brand);
    const brandId = brandText ? await this.brandId(trx, brandText, options, lookups) : undefined;
    const salePrice = parseMoney(clean(row.salePrice), currency, 'salePrice');
    const purchasePrice = parseMoney(clean(row.purchasePrice), currency, 'purchasePrice');
    const barcode = clean(row.barcode) ? westernDigits(clean(row.barcode)!) : null;

    const quantityText = clean(row.openingQuantity);
    const opening = quantityText
      ? {
          quantity: parseDecimal(quantityText, 'openingQuantity'),
          cost: parseMoney(clean(row.openingCost), currency, 'openingCost') ?? purchasePrice,
        }
      : null;
    if (opening && (itemType ?? existing?.itemType) === 'service') {
      throw new RowError('openingQuantity', 'الخدمات ليس لها رصيد');
    }
    if (opening && opening.quantity > 0 && !opening.cost) {
      throw new RowError('openingCost', 'تكلفة رصيد أول المدة مطلوبة (أو سعر الشراء)');
    }
    if (opening && (trackingType ?? existing?.trackingType ?? 'none') !== 'none') {
      throw new RowError('openingQuantity', 'أرصدة الأصناف المتتبعة بالدفعات تُدخل من شاشة رصيد أول المدة (رقم الدفعة مطلوب)');
    }

    if (existing) {
      const updated = await this.productsService.update(trx, existing.id, {
        ...(name ? { name } : {}),
        ...(clean(row.description) ? { description: clean(row.description) } : {}),
        ...(unitOfMeasureId ? { unitOfMeasureId } : {}),
        ...(itemType ? { itemType } : {}),
        ...(trackingType ? { trackingType } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(brandId !== undefined ? { brandId } : {}),
        ...(salePrice ? { salePrice } : {}),
        ...(purchasePrice ? { purchasePrice } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      });
      const variants = await this.variants.listByProductId(trx, existing.id);
      const single = variants.length === 1 ? variants[0]! : null;
      if (barcode && single && single.barcode !== barcode) {
        await this.productsService.updateVariant(trx, existing.id, single.id, { barcode });
      }
      if (opening && !single) throw new RowError('openingQuantity', 'الصنف له أكثر من متغير — أدخل رصيده من شاشة رصيد أول المدة');
      return { status: 'update', productId: updated.id, variantId: single?.id ?? '', code: updated.code, opening };
    }

    const created = await this.productsService.create(trx, {
      code: code ?? undefined,
      name: name!,
      description: clean(row.description),
      unitOfMeasureId: unitOfMeasureId!,
      itemType,
      trackingType,
      categoryId: categoryId ?? null,
      brandId: brandId ?? null,
      salePrice,
      purchasePrice,
      isActive,
      defaultVariantBarcode: barcode,
    });
    return {
      status: 'create',
      productId: created.id,
      variantId: created.variants[0]!.id,
      code: created.code,
      opening,
    };
  }

  private async lookups(trx: Kysely<TenantDatabase>) {
    const units = await this.units.list(trx);
    const categories = await this.catalog.listCategories(trx);
    const brands = await this.catalog.listBrands(trx);
    const unitByKey = new Map<string, string>();
    for (const unit of units) {
      unitByKey.set(nameKey(unit.name), unit.id);
      unitByKey.set(nameKey(unit.symbol), unit.id);
    }
    // Categories are matched by full path ("أغذية > ألبان") or, when unique, by their own name.
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const pathOf = (id: string): string => {
      const parts: string[] = [];
      let current = categoryById.get(id);
      while (current) {
        parts.unshift(current.name);
        current = current.parentId ? categoryById.get(current.parentId) : undefined;
      }
      return parts.map(nameKey).join('>');
    };
    const categoryByPath = new Map(categories.map((category) => [pathOf(category.id), category.id]));
    const categoryByName = new Map<string, string | null>();
    for (const category of categories) {
      const key = nameKey(category.name);
      categoryByName.set(key, categoryByName.has(key) ? null : category.id); // null = ambiguous
    }
    return {
      unitByKey,
      defaultUnitId: units.find((unit) => unit.isActive)?.id ?? null,
      categoryByPath,
      categoryByName,
      brandByKey: new Map(brands.map((brand) => [nameKey(brand.name), brand.id])),
    };
  }

  private async unitId(
    trx: Kysely<TenantDatabase>,
    text: string,
    options: ProductImportOptions,
    lookups: Awaited<ReturnType<ProductImportService['lookups']>>,
  ): Promise<string> {
    const found = lookups.unitByKey.get(nameKey(text));
    if (found) return found;
    if (!options.createMissingUnits) throw new RowError('unit', `وحدة القياس "${text}" غير موجودة`);
    const unit = await this.units.create(trx, { name: text, symbol: text });
    lookups.unitByKey.set(nameKey(text), unit.id);
    return unit.id;
  }

  private async categoryId(
    trx: Kysely<TenantDatabase>,
    text: string,
    options: ProductImportOptions,
    lookups: Awaited<ReturnType<ProductImportService['lookups']>>,
  ): Promise<string> {
    const parts = text
      .split(/\s*[>/›]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    const path = parts.map(nameKey).join('>');
    const byPath = lookups.categoryByPath.get(path);
    if (byPath) return byPath;
    if (parts.length === 1) {
      const byName = lookups.categoryByName.get(nameKey(parts[0]!));
      if (byName) return byName;
      if (byName === null) throw new RowError('category', `يوجد أكثر من تصنيف باسم "${text}" — اكتب المسار كاملًا (رئيسي > فرعي)`);
    }
    if (!options.createMissingCategories) throw new RowError('category', `التصنيف "${text}" غير موجود`);
    // Create each missing level of the path.
    let parentId: string | null = null;
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}>${nameKey(part)}` : nameKey(part);
      const existingId = lookups.categoryByPath.get(prefix);
      if (existingId) {
        parentId = existingId;
        continue;
      }
      const created = await this.catalog.createCategory(trx, { name: part, parentId });
      lookups.categoryByPath.set(prefix, created.id);
      parentId = created.id;
    }
    return parentId!;
  }

  private async brandId(
    trx: Kysely<TenantDatabase>,
    text: string,
    options: ProductImportOptions,
    lookups: Awaited<ReturnType<ProductImportService['lookups']>>,
  ): Promise<string> {
    const found = lookups.brandByKey.get(nameKey(text));
    if (found) return found;
    if (!options.createMissingBrands) throw new RowError('brand', `الماركة "${text}" غير موجودة`);
    const brand = await this.catalog.createBrand(trx, { name: text });
    lookups.brandByKey.set(nameKey(text), brand.id);
    return brand.id;
  }

  /** A row error in Arabic, whatever threw it. */
  private describe(err: unknown): { field: string; message: string } {
    if (err instanceof RowError) return { field: err.field, message: err.message };
    if (err instanceof DomainError && err.code !== LEGACY_ERROR_CODE && AR_MESSAGES[err.code]) {
      return { field: '', message: formatArMessage(err.code, err.params) };
    }
    return { field: '', message: err instanceof Error ? err.message : String(err) };
  }
}
