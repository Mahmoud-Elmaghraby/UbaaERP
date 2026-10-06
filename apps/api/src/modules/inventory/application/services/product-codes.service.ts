import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import {
  INVENTORY_SETTINGS_REPOSITORY,
  type InventorySettingsRepository,
} from '../ports/inventory-settings.repository';
import { PRODUCT_VARIANT_REPOSITORY, type ProductVariantRepository } from '../ports/product-variant.repository';
import { BusinessRuleError } from '../errors';

/** numbering_sequences document types owned by Inventory (prefix/padding editable in Settings › Numbering). */
export const PRODUCT_CODE_SEQUENCE = 'product';
export const PRODUCT_BARCODE_SEQUENCE = 'product_barcode';
const MAX_ATTEMPTS = 20;

/** EAN-13 check digit for the first 12 digits (weights 1,3,1,3… from the left). */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Produces item codes, variant SKUs and barcodes when the tenant chose
 * automatic generation (Inventory settings). Every generated value is
 * checked against what users typed by hand, so the auto and manual worlds
 * can coexist (e.g. an old catalogue imported with its own codes).
 */
@Injectable()
export class ProductCodesService {
  constructor(
    @Inject(INVENTORY_SETTINGS_REPOSITORY) private readonly settings: InventorySettingsRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly variants: ProductVariantRepository,
    private readonly numbering: NumberingSequencesService,
  ) {}

  /** The code to save: the typed one, or the next 'product' number in auto mode. */
  async resolveItemCode(
    trx: Kysely<TenantDatabase>,
    typed: string | undefined,
    codeTaken: (code: string) => Promise<boolean>,
  ): Promise<string> {
    const trimmed = typed?.trim();
    if (trimmed) return trimmed;
    const settings = await this.settings.get(trx);
    if (settings.itemCodeMode !== 'auto') {
      throw new BusinessRuleError('An item code is required (automatic item codes are turned off).', {
        code: 'PRODUCT.CODE_REQUIRED',
      });
    }
    await this.numbering.ensureTenantWide(trx, PRODUCT_CODE_SEQUENCE, { prefix: 'ITM-', paddingLength: 5 });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const { formatted } = await this.numbering.allocateNext(trx, PRODUCT_CODE_SEQUENCE);
      if (!(await codeTaken(formatted))) return formatted;
    }
    throw new BusinessRuleError('Could not find a free item code; check the product numbering sequence.', {
      code: 'PRODUCT.CODE_GENERATION_FAILED',
    });
  }

  /** A SKU for a new variant: the typed one, the product code (first variant), or code-2, code-3… */
  async resolveVariantSku(trx: Kysely<TenantDatabase>, typed: string | undefined, productCode: string): Promise<string> {
    const trimmed = typed?.trim();
    if (trimmed) return trimmed;
    if (!(await this.variants.skuExists(trx, productCode))) return productCode;
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
      const candidate = `${productCode}-${suffix}`;
      if (!(await this.variants.skuExists(trx, candidate))) return candidate;
    }
    throw new BusinessRuleError('Could not find a free SKU for this product.', { code: 'PRODUCT_VARIANT.SKU_GENERATION_FAILED' });
  }

  /** The barcode to save: the typed one, a generated EAN-13 in auto mode, or none. */
  async resolveBarcode(trx: Kysely<TenantDatabase>, typed: string | null | undefined): Promise<string | null> {
    const trimmed = typed?.trim();
    if (trimmed) return trimmed;
    const settings = await this.settings.get(trx);
    if (settings.barcodeMode !== 'auto') return null;
    return this.generateBarcode(trx, settings.barcodePrefix);
  }

  async generateBarcode(trx: Kysely<TenantDatabase>, prefix?: string): Promise<string> {
    const barcodePrefix = prefix ?? (await this.settings.get(trx)).barcodePrefix;
    const bodyLength = 12 - barcodePrefix.length;
    await this.numbering.ensureTenantWide(trx, PRODUCT_BARCODE_SEQUENCE, { prefix: null, paddingLength: 1 });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const { number } = await this.numbering.allocateNext(trx, PRODUCT_BARCODE_SEQUENCE);
      const body = String(number).padStart(bodyLength, '0');
      if (body.length > bodyLength) break;
      const first12 = `${barcodePrefix}${body}`;
      const barcode = `${first12}${ean13CheckDigit(first12)}`;
      if (!(await this.variants.barcodeExists(trx, barcode))) return barcode;
    }
    throw new BusinessRuleError('Could not generate a free barcode; try a different barcode prefix.', {
      code: 'PRODUCT_VARIANT.BARCODE_GENERATION_FAILED',
    });
  }
}
