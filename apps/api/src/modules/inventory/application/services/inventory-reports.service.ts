import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  INVENTORY_REPORTS_REPOSITORY,
  type InventoryReportsRepository,
  type ItemCardMovementRow,
  type LowStockRow,
  type ValuationRow,
} from '../ports/inventory-reports.repository';
import { BusinessRuleError } from '../errors';

const ITEM_CARD_LIMIT = 5000;

export interface ItemCard {
  productVariantId: string;
  warehouseId: string | null;
  openingQuantity: number;
  closingQuantity: number;
  totalIn: number;
  totalOut: number;
  /** True when the period had more movements than the card returns. */
  truncated: boolean;
  movements: (ItemCardMovementRow & { balance: number })[];
}

/** كارت الصنف، تقييم المخزون، الأصناف تحت حد الطلب — read-only reports. */
@Injectable()
export class InventoryReportsService {
  constructor(@Inject(INVENTORY_REPORTS_REPOSITORY) private readonly reports: InventoryReportsRepository) {}

  /**
   * Item card (كارت الصنف): opening balance at `from`, then every movement
   * in the period with a running balance. `to` is exclusive.
   */
  async itemCard(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    filter: { warehouseId?: string | null; from?: Date | null; to?: Date | null },
  ): Promise<ItemCard> {
    if (filter.from && filter.to && filter.from >= filter.to) {
      throw new BusinessRuleError('The start date must be before the end date.', { code: 'REPORT.INVALID_PERIOD' });
    }
    const warehouseId = filter.warehouseId ?? null;
    const openingQuantity = filter.from
      ? await this.reports.quantityBefore(db, productVariantId, warehouseId, filter.from)
      : 0;
    const rows = await this.reports.itemCardMovements(db, productVariantId, {
      warehouseId,
      from: filter.from ?? null,
      to: filter.to ?? null,
      limit: ITEM_CARD_LIMIT + 1,
    });
    const truncated = rows.length > ITEM_CARD_LIMIT;
    let balance = openingQuantity;
    let totalIn = 0;
    let totalOut = 0;
    const movements = rows.slice(0, ITEM_CARD_LIMIT).map((row) => {
      balance = round(balance + row.quantity);
      if (row.quantity > 0) totalIn += row.quantity;
      else totalOut -= row.quantity;
      return { ...row, balance };
    });
    return {
      productVariantId,
      warehouseId,
      openingQuantity,
      closingQuantity: balance,
      totalIn: round(totalIn),
      totalOut: round(totalOut),
      truncated,
      movements,
    };
  }

  valuation(db: Kysely<TenantDatabase>, warehouseId?: string | null): Promise<ValuationRow[]> {
    return this.reports.valuation(db, warehouseId ?? null);
  }

  lowStock(db: Kysely<TenantDatabase>, warehouseId?: string | null): Promise<LowStockRow[]> {
    return this.reports.lowStock(db, warehouseId ?? null);
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
