import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { PRODUCT_REPOSITORY, type ProductRepository } from '../ports/product.repository';
import { PRODUCT_UNIT_REPOSITORY, type ProductUnitRepository } from '../ports/product-unit.repository';
import { UNIT_OF_MEASURE_REPOSITORY, type UnitOfMeasureRepository } from '../ports/unit-of-measure.repository';
import type { ProductUnit, ProductUnitInput } from '../../domain/product-unit.entity';
import { BusinessRuleError } from '../errors';

const MAX_UNITS = 20;

/** A product's extra trading units (كرتونة، شكارة، علبة…) — see migration 0079. */
@Injectable()
export class ProductUnitsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_UNIT_REPOSITORY) private readonly units: ProductUnitRepository,
    @Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly unitsOfMeasure: UnitOfMeasureRepository,
  ) {}

  async list(db: Kysely<TenantDatabase>, productId: string): Promise<ProductUnit[]> {
    if (!(await this.products.findById(db, productId))) throw entityNotFound('PRODUCT', productId);
    return this.units.listByProductId(db, productId);
  }

  /**
   * Replaces the whole unit list. Lines already on documents keep the
   * factor they were created with, so editing a factor never rewrites
   * history.
   */
  async replace(db: Kysely<TenantDatabase>, productId: string, input: ProductUnitInput[]): Promise<ProductUnit[]> {
    const product = await this.products.findById(db, productId);
    if (!product) throw entityNotFound('PRODUCT', productId);
    if (input.length > MAX_UNITS) {
      throw new BusinessRuleError(`A product can have at most ${MAX_UNITS} extra units.`, {
        code: 'PRODUCT_UNIT.TOO_MANY',
        params: { max: MAX_UNITS },
      });
    }
    if (input.length > 0 && product.trackingType === 'serial') {
      throw new BusinessRuleError('Serial-tracked items are traded one unit at a time and cannot have pack units.', {
        code: 'PRODUCT_UNIT.SERIAL_NOT_ALLOWED',
      });
    }
    const seen = new Set<string>();
    for (const unit of input) {
      if (unit.unitOfMeasureId === product.unitOfMeasureId) {
        throw new BusinessRuleError('The base unit is already the product’s own unit — add only bigger/other units.', {
          code: 'PRODUCT_UNIT.SAME_AS_BASE',
        });
      }
      if (seen.has(unit.unitOfMeasureId)) {
        throw new BusinessRuleError('The same unit is listed twice.', { code: 'PRODUCT_UNIT.DUPLICATE' });
      }
      seen.add(unit.unitOfMeasureId);
      if (!Number.isFinite(unit.factor) || unit.factor <= 0 || unit.factor > 1_000_000) {
        throw new BusinessRuleError('A unit factor must be a positive number.', {
          code: 'PRODUCT_UNIT.INVALID_FACTOR',
        });
      }
      if (unit.salePrice?.isNegative() || unit.purchasePrice?.isNegative()) {
        throw new BusinessRuleError('Prices cannot be negative.', { code: 'PRODUCT_UNIT.NEGATIVE_PRICE' });
      }
      if (!(await this.unitsOfMeasure.findById(db, unit.unitOfMeasureId))) {
        throw entityNotFound('UNIT_OF_MEASURE', unit.unitOfMeasureId);
      }
    }
    if (
      input.filter((unit) => unit.isDefaultSale).length > 1 ||
      input.filter((unit) => unit.isDefaultPurchase).length > 1
    ) {
      throw new BusinessRuleError('Only one unit can be the default for sales, and one for purchases.', {
        code: 'PRODUCT_UNIT.MULTIPLE_DEFAULTS',
      });
    }
    return withTransaction(db, (trx) => this.units.replace(trx, productId, input));
  }
}
