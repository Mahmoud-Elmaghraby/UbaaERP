/**
 * Inventory's permission keys (migration 0082 replaced the single coarse
 * 'inventory.manage'). One place for the API so controllers, the
 * attachments map and other modules' read endpoints never spell a key by
 * hand. The web keeps the same literals in apps/web/src/lib/permissions.ts.
 *
 * Split the way competitors split stock work between a store keeper, a
 * purchasing clerk and an accountant (Odoo inventory user/manager, Katana's
 * separate "view cost and stock value" permission):
 *  - who may see / edit the item master,
 *  - who may move stock (manual movements, transfers, counts) and who may
 *    POST the documents that change stock value,
 *  - who may see costs at all (a store keeper usually must not).
 */
export const INVENTORY_PERMISSIONS = {
  productsView: 'inventory.products.view',
  productsManage: 'inventory.products.manage',
  costsView: 'inventory.costs.view',
  stockView: 'inventory.stock.view',
  movementsManage: 'inventory.movements.manage',
  transfersManage: 'inventory.transfers.manage',
  transfersApprove: 'inventory.transfers.approve',
  countsManage: 'inventory.counts.manage',
  countsPost: 'inventory.counts.post',
  landedCostsManage: 'inventory.landed_costs.manage',
  reportsView: 'inventory.reports.view',
  settingsManage: 'inventory.settings.manage',
} as const;

export type InventoryPermission = (typeof INVENTORY_PERMISSIONS)[keyof typeof INVENTORY_PERMISSIONS];

export const ALL_INVENTORY_PERMISSIONS: readonly InventoryPermission[] = Object.values(INVENTORY_PERMISSIONS);

/**
 * Reading the item catalogue (products, variants, units, categories,
 * warehouses) is needed by every module that puts items on a document.
 */
export const CATALOG_READ_PERMISSIONS = [
  INVENTORY_PERMISSIONS.productsView,
  'sales.manage',
  'purchases.manage',
] as const;

/** Warehouses / locations are picked on sales and purchase documents and on every stock screen. */
export const WAREHOUSE_READ_PERMISSIONS = [
  INVENTORY_PERMISSIONS.productsView,
  INVENTORY_PERMISSIONS.stockView,
  'sales.manage',
  'purchases.manage',
] as const;

export function canViewCosts(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.includes(INVENTORY_PERMISSIONS.costsView));
}

/** Default purchase prices are a purchasing tool as much as a cost: buyers see them too. */
export function canViewPurchasePrices(permissions: readonly string[] | undefined): boolean {
  return canViewCosts(permissions) || Boolean(permissions?.includes('purchases.manage'));
}

/**
 * Returns a copy of a response DTO with every `purchasePrice` (at any
 * depth — product, variant, unit rows) set to null. Used by the catalogue
 * endpoints for users who may not see costs.
 */
export function withoutPurchasePrices<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutPurchasePrices(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const copy: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = key === 'purchasePrice' ? null : withoutPurchasePrices(inner);
    }
    return copy as T;
  }
  return value;
}
