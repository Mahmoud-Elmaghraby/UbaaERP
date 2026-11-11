/**
 * Starting points for a new role (like Wafeq's default roles). Only a template: the keys that
 * don't exist in this tenant are dropped, and the role is edited freely afterwards.
 */
export interface RoleTemplate {
  key: string;
  permissionKeys: string[];
}

const INVENTORY_READ = ['inventory.products.view', 'inventory.stock.view'];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { key: 'cashier', permissionKeys: ['pos.use', ...INVENTORY_READ] },
  {
    key: 'storeSupervisor',
    permissionKeys: ['pos.use', 'pos.supervise', 'sales.view', 'sales.create', 'sales.post', 'sales.override_credit_limit', 'sales.override_limits', 'sales.reports.view', ...INVENTORY_READ, 'inventory.reports.view'],
  },
  { key: 'salesperson', permissionKeys: ['sales.view', 'sales.create', ...INVENTORY_READ] },
  {
    key: 'storekeeper',
    permissionKeys: [
      ...INVENTORY_READ,
      'inventory.movements.manage',
      'inventory.transfers.manage',
      'inventory.counts.manage',
      'inventory.reports.view',
    ],
  },
  {
    key: 'purchasing',
    permissionKeys: ['purchases.view', 'purchases.create', 'purchases.post', 'purchases.reports.view', ...INVENTORY_READ, 'inventory.costs.view'],
  },
  {
    key: 'accountant',
    permissionKeys: [
      'accounting.manage',
      'accounting.approve',
      'treasury.view',
      'treasury.manage',
      'treasury.vouchers.manage',
      'sales.view',
      'sales.post',
      'sales.reports.view',
      'purchases.view',
      'purchases.post',
      'purchases.reports.view',
      'inventory.reports.view',
      'inventory.costs.view',
    ],
  },
  {
    key: 'viewer',
    permissionKeys: ['sales.view', 'sales.reports.view', 'purchases.view', 'purchases.reports.view', 'treasury.view', ...INVENTORY_READ, 'inventory.reports.view', 'audit_logs.view'],
  },
  { key: 'hrOfficer', permissionKeys: ['hr.employees.view', 'hr.employees.manage'] },
  // Everything except running the system itself (users, roles, settings).
  { key: 'manager', permissionKeys: ['*'] },
];

const ADMIN_KEYS = ['users.manage', 'roles.manage', 'settings.manage'];

export function templateKeys(template: RoleTemplate, available: string[]): string[] {
  if (template.permissionKeys.includes('*')) return available.filter((key) => !ADMIN_KEYS.includes(key));
  return template.permissionKeys.filter((key) => available.includes(key));
}
