import { withTransaction } from '../../../../database/tenant/transaction.util';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { PriceListDto, PriceListKindDto, PriceListSummaryDto, SavePriceListDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  BusinessRuleError,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
} from '../../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Price lists (wholesale, retail, distributors…) — plain CRUD (CLAUDE.md
 * §2.1): pricing only, no ledger effect. Saving sends the header and the
 * whole item set, which replaces the old items in one transaction. Which
 * price a document line gets is decided in one place on the client
 * (apps/web/src/components/product/sale-pricing.ts).
 *
 * Every method is scoped to one kind (migration 0115): 'sale' lists belong to customers and
 * sales documents, 'purchase' lists to suppliers and purchase documents. A list of the other
 * kind is "not found" here, so neither screen can read or change the other's lists.
 */
@Injectable()
export class PriceListsService {
  async list(db: Kysely<TenantDatabase>, kind: PriceListKindDto = 'sale'): Promise<PriceListSummaryDto[]> {
    const rows = await this.summaries(db)
      .where('pl.kind', '=', kind)
      .orderBy('pl.is_active', 'desc')
      .orderBy('pl.name')
      .execute();
    return rows.map(toSummary);
  }

  async getById(db: Kysely<TenantDatabase>, id: string, kind: PriceListKindDto = 'sale'): Promise<PriceListDto> {
    const row = await this.summaries(db).where('pl.id', '=', id).where('pl.kind', '=', kind).executeTakeFirst();
    if (!row) throw entityNotFound('PRICE_LIST', id);
    const items = await db
      .selectFrom('price_list_items')
      .select(['id', 'product_id', 'product_variant_id', 'min_quantity', 'price_amount'])
      .where('price_list_id', '=', id)
      .orderBy('product_id')
      .orderBy('product_variant_id')
      .orderBy('min_quantity')
      .execute();
    return {
      ...toSummary(row),
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        productVariantId: item.product_variant_id,
        minQuantity: trimDecimal(item.min_quantity),
        priceAmountMinorUnits: String(item.price_amount),
      })),
    };
  }

  async save(
    db: Kysely<TenantDatabase>,
    id: string | null,
    input: SavePriceListDto,
    kind: PriceListKindDto = 'sale',
  ): Promise<PriceListDto> {
    const items = input.items.map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId ?? null,
      minQuantity: item.minQuantity ?? '0',
      price: item.priceAmountMinorUnits,
    }));
    this.assertNoDuplicateItems(items);
    await this.assertVariantsBelongToProducts(db, items);

    const listId = id ?? randomUUID();
    const header = {
      name: input.name,
      currency: input.currency,
      discount_percent: input.discountPercent ?? '0',
      is_active: input.isActive ?? true,
      notes: input.notes ?? null,
    };
    try {
      await withTransaction(db, async (trx) => {
        if (id) {
          const updated = await trx
            .updateTable('price_lists')
            .set({ ...header, updated_at: new Date() })
            .where('id', '=', id)
            .where('kind', '=', kind)
            .executeTakeFirst();
          if (!updated.numUpdatedRows) throw entityNotFound('PRICE_LIST', id);
          await trx.deleteFrom('price_list_items').where('price_list_id', '=', id).execute();
        } else {
          await trx.insertInto('price_lists').values({ id: listId, kind, ...header }).execute();
        }
        // Chunked: a big catalogue can have thousands of rows.
        for (let start = 0; start < items.length; start += 1000) {
          await trx
            .insertInto('price_list_items')
            .values(
              items.slice(start, start + 1000).map((item) => ({
                id: randomUUID(),
                price_list_id: listId,
                product_id: item.productId,
                product_variant_id: item.productVariantId,
                min_quantity: item.minQuantity,
                price_amount: item.price,
              })),
            )
            .execute();
        }
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('PRICE_LIST', 'name', input.name);
      throw err;
    }
    return this.getById(db, listId, kind);
  }

  /** A list still set on customers or suppliers can't go — deactivate it instead. */
  async delete(db: Kysely<TenantDatabase>, id: string, kind: PriceListKindDto = 'sale'): Promise<void> {
    try {
      const result = await db.deleteFrom('price_lists').where('id', '=', id).where('kind', '=', kind).executeTakeFirst();
      if (!result.numDeletedRows) throw entityNotFound('PRICE_LIST', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('This price list is still set on customers or suppliers; deactivate it instead.', {
          code: 'PRICE_LIST.IN_USE',
        });
      }
      throw err;
    }
  }

  private assertNoDuplicateItems(items: { productId: string; productVariantId: string | null; minQuantity: string }[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.productId}|${item.productVariantId ?? ''}|${Number(item.minQuantity)}`;
      if (seen.has(key)) {
        throw new BusinessRuleError('The same item and minimum quantity appear twice in the list.', {
          code: 'PRICE_LIST.DUPLICATE_ITEM',
        });
      }
      seen.add(key);
    }
  }

  private async assertVariantsBelongToProducts(
    db: Kysely<TenantDatabase>,
    items: { productId: string; productVariantId: string | null }[],
  ) {
    const variantIds = [...new Set(items.flatMap((item) => (item.productVariantId ? [item.productVariantId] : [])))];
    if (variantIds.length === 0) return;
    const rows = await db.selectFrom('product_variants').select(['id', 'product_id']).where('id', 'in', variantIds).execute();
    const owner = new Map(rows.map((row) => [row.id, row.product_id]));
    for (const item of items) {
      if (item.productVariantId && owner.get(item.productVariantId) !== item.productId) {
        throw new BusinessRuleError('A price list item names a variant of another product.', {
          code: 'PRICE_LIST.VARIANT_MISMATCH',
        });
      }
    }
  }

  private summaries(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('price_lists as pl')
      .selectAll('pl')
      .select([
        sql<number>`(SELECT count(*)::int FROM price_list_items i WHERE i.price_list_id = pl.id)`.as('item_count'),
        sql<number>`(SELECT count(*)::int FROM customers c WHERE c.price_list_id = pl.id)`.as('customer_count'),
        sql<number>`(SELECT count(*)::int FROM suppliers s WHERE s.price_list_id = pl.id)`.as('supplier_count'),
      ]);
  }
}

function trimDecimal(value: string | number): string {
  const text = String(value);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function toSummary(row: {
  id: string;
  kind: PriceListKindDto;
  name: string;
  currency: string;
  discount_percent: string;
  is_active: boolean;
  notes: string | null;
  item_count: number;
  customer_count: number;
  supplier_count: number;
}): PriceListSummaryDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    currency: row.currency,
    discountPercent: trimDecimal(row.discount_percent),
    isActive: row.is_active,
    notes: row.notes,
    itemCount: Number(row.item_count),
    customerCount: Number(row.customer_count),
    supplierCount: Number(row.supplier_count),
  };
}
