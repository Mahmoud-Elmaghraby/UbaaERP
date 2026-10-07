/**
 * The one event through which Inventory tells Accounting that stock value
 * changed for a reason other than a sale (COGS keeps its own two events,
 * inventory.stock_consumption.recorded / stock_restoration.recorded).
 *
 * Written to the outbox in the same transaction as the stock movements
 * (CLAUDE.md §2.7). Inventory only says WHAT happened (`kind`) and how much
 * value moved; Accounting owns which accounts that means
 * (AccountingInventoryPostingListener). One journal entry per source
 * document, keyed by (sourceType, sourceId) so a redelivered event never
 * posts twice.
 *
 * Kinds and the entry Accounting makes (Dr / Cr):
 *  - receipt                Inventory / Goods received not invoiced
 *  - purchase_return        Goods received not invoiced / Inventory
 *  - adjustment_gain        Inventory / adjustment account (reason's account, else default)
 *  - adjustment_loss        adjustment account / Inventory
 *  - opening                Inventory / Opening balances (equity)
 *  - landed_cost_inventory  Inventory / landed-cost clearing account
 *  - landed_cost_cogs       Cost of goods sold / landed-cost clearing account
 */
export const INVENTORY_VALUATION_POSTED = 'inventory.valuation.posted';

export type InventoryValuationKind =
  | 'receipt'
  | 'purchase_return'
  | 'adjustment_gain'
  | 'adjustment_loss'
  | 'opening'
  | 'landed_cost_inventory'
  | 'landed_cost_cogs';

export type InventoryValuationSource =
  | 'goods_receipt'
  | 'purchase_return'
  | 'stock_adjustment'
  | 'stock_count'
  | 'opening_balance'
  | 'stock_transfer'
  | 'landed_cost';

export interface InventoryValuationEntry {
  kind: InventoryValuationKind;
  amount: { amountMinorUnits: string; currency: string };
  /** Chart-of-accounts id chosen for this entry (an adjustment reason's account); null = Accounting's default. */
  counterAccountId: string | null;
}

export interface InventoryValuationPostedMetadata {
  sourceType: InventoryValuationSource;
  sourceId: string;
  documentNumber: string | null;
  /** YYYY-MM-DD the entry belongs to (document date), not when the outbox ran. */
  entryDate: string;
  description: string | null;
  entries: InventoryValuationEntry[];
}
