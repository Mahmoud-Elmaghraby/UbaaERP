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

/** Sales and Purchases keys (migration 0117). Mirrors apps/api/src/shared/auth/trade-permissions.ts. */
export const SALES = {
  view: 'sales.view',
  create: 'sales.create',
  post: 'sales.post',
  cancel: 'sales.cancel',
  reportsView: 'sales.reports.view',
  settingsManage: 'sales.settings.manage',
  posUse: 'pos.use',
  posSupervise: 'pos.supervise',
} as const;

export const PURCH = {
  view: 'purchases.view',
  create: 'purchases.create',
  post: 'purchases.post',
  cancel: 'purchases.cancel',
  reportsView: 'purchases.reports.view',
  settingsManage: 'purchases.settings.manage',
} as const;

/** HR keys (migration 0123). Mirrors apps/api/src/shared/auth/hr-permissions.ts. */
export const HR = {
  employeesView: 'hr.employees.view',
  employeesManage: 'hr.employees.manage',
  salariesView: 'hr.salaries.view',
  salariesManage: 'hr.salaries.manage',
  attendanceView: 'hr.attendance.view',
  attendanceManage: 'hr.attendance.manage',
  leavesView: 'hr.leaves.view',
  leavesManage: 'hr.leaves.manage',
  leavesApprove: 'hr.leaves.approve',
} as const;

export const ANY_HR_PERMISSION: string[] = Object.values(HR);

/** Any document action at all — the header area that holds the individual buttons. */
export const SALES_WRITE: string[] = [SALES.create, SALES.post, SALES.cancel];
export const PURCH_WRITE: string[] = [PURCH.create, PURCH.post, PURCH.cancel];
/** Shows the module in the sidebar. */
export const ANY_SALES_PERMISSION: string[] = [SALES.view, SALES.reportsView, SALES.settingsManage];
export const ANY_PURCHASES_PERMISSION: string[] = [PURCH.view, PURCH.reportsView, PURCH.settingsManage];

/** Any inventory permission at all — shows the Inventory section in the sidebar. */
export const ANY_INVENTORY_PERMISSION: string[] = Object.values(INV);

/** Any one of these permissions passes (OR), like <Can permission={[...]}>. */
export function hasAny(granted: readonly string[], required: string | readonly string[] | undefined): boolean {
  if (!required) return true;
  const list = typeof required === 'string' ? [required] : required;
  return list.length === 0 || list.some((permission) => granted.includes(permission));
}
