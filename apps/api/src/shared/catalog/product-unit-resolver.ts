import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

export interface UnitRequest {
  productVariantId: string;
  unitOfMeasureId?: string | null;
  /** Already known (copied from a source line) — kept as is. */
  unitFactor?: number;
}

export type WithUnit<T> = T & { unitOfMeasureId: string | null; unitFactor: number };

/**
 * Resolves the unit of document lines (migration 0079) for Sales and
 * Purchases: no unit / the product's base unit → (null, 1); one of the
 * product's own pack units → (unit, its factor). Anything else is refused.
 * A plain read of Inventory's catalogue tables — reference data the lines
 * already point at by FK — never Inventory behaviour (CLAUDE.md §2.6).
 */
@Injectable()
export class ProductUnitResolver {
  async resolve<T extends UnitRequest>(db: Kysely<TenantDatabase>, lines: readonly T[]): Promise<WithUnit<T>[]> {
    const pending = lines.filter((line) => line.unitOfMeasureId && line.unitFactor === undefined);
    const known = new Map<string, { base: string; name: string; units: Map<string, number> }>();
    if (pending.length > 0) {
      const variantIds = [...new Set(pending.map((line) => line.productVariantId))];
      const products = await db
        .selectFrom('product_variants')
        .innerJoin('products', 'products.id', 'product_variants.product_id')
        .select([
          'product_variants.id as variant_id',
          'products.id as product_id',
          'products.name as name',
          'products.unit_of_measure_id as base_unit_id',
        ])
        .where('product_variants.id', 'in', variantIds)
        .execute();
      const productIds = [...new Set(products.map((row) => row.product_id))];
      const units = productIds.length
        ? await db
            .selectFrom('product_units')
            .select(['product_id', 'unit_of_measure_id', 'factor'])
            .where('product_id', 'in', productIds)
            .execute()
        : [];
      for (const row of products) {
        known.set(row.variant_id, {
          base: row.base_unit_id,
          name: row.name,
          units: new Map(
            units
              .filter((unit) => unit.product_id === row.product_id)
              .map((unit) => [unit.unit_of_measure_id, Number(unit.factor)]),
          ),
        });
      }
    }
    return lines.map((line) => {
      if (!line.unitOfMeasureId) return { ...line, unitOfMeasureId: null, unitFactor: 1 };
      if (line.unitFactor !== undefined) return { ...line, unitOfMeasureId: line.unitOfMeasureId, unitFactor: line.unitFactor };
      const product = known.get(line.productVariantId);
      if (product && product.base === line.unitOfMeasureId) return { ...line, unitOfMeasureId: null, unitFactor: 1 };
      const factor = product?.units.get(line.unitOfMeasureId);
      if (factor === undefined) {
        throw new BusinessRuleError('This unit is not defined for the product.', {
          code: 'DOCUMENT.UNIT_NOT_ALLOWED',
          params: { name: product?.name ?? '' },
        });
      }
      return { ...line, unitOfMeasureId: line.unitOfMeasureId, unitFactor: factor };
    });
  }
}
