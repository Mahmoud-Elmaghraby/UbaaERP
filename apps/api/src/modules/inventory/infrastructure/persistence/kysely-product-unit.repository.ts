import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { ProductUnitsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ProductUnitRepository } from '../../application/ports/product-unit.repository';
import type { ProductUnit, ProductUnitInput, ProductUnitLookup } from '../../domain/product-unit.entity';

function money(amount: string | null, currency: string | null): Money | null {
  return amount !== null && currency !== null ? Money.fromMinorUnits(BigInt(amount), currency) : null;
}

function toDomain(row: Selectable<ProductUnitsTable>): ProductUnit {
  return {
    id: row.id,
    productId: row.product_id,
    unitOfMeasureId: row.unit_of_measure_id,
    factor: Number(row.factor),
    salePrice: money(row.sale_price_amount, row.sale_price_currency),
    purchasePrice: money(row.purchase_price_amount, row.purchase_price_currency),
    isDefaultSale: row.is_default_sale,
    isDefaultPurchase: row.is_default_purchase,
  };
}

export class KyselyProductUnitRepository implements ProductUnitRepository {
  async listByProductId(db: Kysely<TenantDatabase>, productId: string): Promise<ProductUnit[]> {
    const rows = await db
      .selectFrom('product_units')
      .selectAll()
      .where('product_id', '=', productId)
      .orderBy('factor')
      .execute();
    return rows.map(toDomain);
  }

  async listAllForLookup(db: Kysely<TenantDatabase>): Promise<Map<string, ProductUnitLookup[]>> {
    const rows = await db
      .selectFrom('product_units')
      .innerJoin('units_of_measure', 'units_of_measure.id', 'product_units.unit_of_measure_id')
      .selectAll('product_units')
      .select(['units_of_measure.name as unit_name', 'units_of_measure.symbol as unit_symbol'])
      .orderBy('product_units.factor')
      .execute();
    const byProduct = new Map<string, ProductUnitLookup[]>();
    for (const row of rows) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push({
        unitOfMeasureId: row.unit_of_measure_id,
        name: row.unit_name,
        symbol: row.unit_symbol,
        factor: Number(row.factor),
        salePrice: money(row.sale_price_amount, row.sale_price_currency),
        purchasePrice: money(row.purchase_price_amount, row.purchase_price_currency),
        isDefaultSale: row.is_default_sale,
        isDefaultPurchase: row.is_default_purchase,
      });
      byProduct.set(row.product_id, list);
    }
    return byProduct;
  }

  async replace(db: Kysely<TenantDatabase>, productId: string, units: ProductUnitInput[]): Promise<ProductUnit[]> {
    await db.deleteFrom('product_units').where('product_id', '=', productId).execute();
    if (units.length > 0) {
      await db
        .insertInto('product_units')
        .values(
          units.map((unit) => ({
            id: randomUUID(),
            product_id: productId,
            unit_of_measure_id: unit.unitOfMeasureId,
            factor: String(unit.factor),
            sale_price_amount: unit.salePrice ? unit.salePrice.toMinorUnits().toString() : null,
            sale_price_currency: unit.salePrice ? unit.salePrice.currency : null,
            purchase_price_amount: unit.purchasePrice ? unit.purchasePrice.toMinorUnits().toString() : null,
            purchase_price_currency: unit.purchasePrice ? unit.purchasePrice.currency : null,
            is_default_sale: unit.isDefaultSale ?? false,
            is_default_purchase: unit.isDefaultPurchase ?? false,
          })),
        )
        .execute();
    }
    return this.listByProductId(db, productId);
  }
}
