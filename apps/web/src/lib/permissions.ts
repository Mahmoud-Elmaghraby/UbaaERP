/**
 * Permission keys used by the UI. Mirrors apps/api/src/shared/auth/
 * inventory-permissions.ts (the API is the authority — this only drives
 * what <Can> shows).
 */
export const INV = {
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

/** Any inventory permission at all — shows the Inventory section in the sidebar. */
export const ANY_INVENTORY_PERMISSION: string[] = Object.values(INV);

/** Any one of these permissions passes (OR), like <Can permission={[...]}>. */
export function hasAny(granted: readonly string[], required: string | readonly string[] | undefined): boolean {
  if (!required) return true;
  const list = typeof required === 'string' ? [required] : required;
  return list.length === 0 || list.some((permission) => granted.includes(permission));
}
