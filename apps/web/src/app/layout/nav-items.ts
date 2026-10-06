import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon?: LucideIcon;
  /** Permission key required to see this item — omit for permission-free items. Applies to
   * the whole group (item + children): sub-sections don't have their own permission in this
   * MVP, `inventory.manage` covers all of Inventory's sub-sections together. */
  permission?: string;
  /** Plan feature key (see lib/feature-keys.ts) — hidden when the tenant doesn't have it
   * or turned it off. UX only; the API enforces it (PlanFeatureGuard). */
  feature?: string;
  /** Sub-sections rendered as a nested list under this item, expanded whenever the current
   * route is this item's path or a descendant of it (see AppShell). */
  children?: NavItem[];
}

export interface NavGroup {
  key: string;
  /** Section heading in the sidebar; omitted for the top "home" group. */
  labelKey?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'main',
    items: [{ to: '/', labelKey: 'nav.home', icon: LayoutDashboard }],
  },
  {
    key: 'operations',
    labelKey: 'nav.groups.operations',
    items: [
      {
        to: '/sales',
        labelKey: 'nav.sales',
        icon: ShoppingCart,
        permission: 'sales.manage',
        children: [
          { to: '/sales/customers', labelKey: 'sales.tabs.customers' },
          { to: '/sales/quotations', labelKey: 'sales.tabs.quotations', feature: 'sales.quotations' },
          { to: '/sales/sales-orders', labelKey: 'sales.tabs.salesOrders', feature: 'sales.sales_orders' },
          { to: '/sales/deliveries', labelKey: 'sales.tabs.deliveries', feature: 'sales.deliveries' },
          { to: '/sales/sales-invoices', labelKey: 'sales.tabs.salesInvoices' },
          { to: '/sales/payments-received', labelKey: 'sales.tabs.paymentsReceived' },
          { to: '/sales/sales-returns', labelKey: 'sales.tabs.salesReturns' },
          { to: '/sales/sales-credit-notes', labelKey: 'sales.tabs.salesCreditNotes' },
          { to: '/sales/eta-credentials', labelKey: 'sales.tabs.etaCredentials' },
        ],
      },
      {
        to: '/purchases',
        labelKey: 'nav.purchases',
        icon: Truck,
        permission: 'purchases.manage',
        children: [
          { to: '/purchases/suppliers', labelKey: 'purchases.tabs.suppliers' },
          { to: '/purchases/purchase-requisitions', labelKey: 'purchases.tabs.purchaseRequisitions' },
          { to: '/purchases/rfqs', labelKey: 'purchases.tabs.rfqs', feature: 'purchases.rfq' },
          {
            to: '/purchases/purchase-orders',
            labelKey: 'purchases.tabs.purchaseOrders',
            feature: 'purchases.purchase_orders',
          },
          {
            to: '/purchases/goods-receipts',
            labelKey: 'purchases.tabs.goodsReceipts',
            feature: 'purchases.goods_receipts',
          },
          { to: '/purchases/purchase-returns', labelKey: 'purchases.tabs.purchaseReturns' },
          { to: '/purchases/purchase-invoices', labelKey: 'purchases.tabs.purchaseInvoices' },
        ],
      },
      {
        to: '/inventory',
        labelKey: 'nav.inventory',
        icon: Package,
        permission: 'inventory.manage',
        children: [
          { to: '/inventory/products', labelKey: 'inventory.tabs.products' },
          { to: '/inventory/catalog', labelKey: 'inventory.tabs.catalog' },
          { to: '/inventory/labels', labelKey: 'inventory.tabs.labels' },
          { to: '/inventory/warehouses', labelKey: 'inventory.tabs.warehouses' },
          { to: '/inventory/units-of-measure', labelKey: 'inventory.tabs.unitsOfMeasure' },
          { to: '/inventory/stock', labelKey: 'inventory.tabs.stock' },
          { to: '/inventory/counts', labelKey: 'inventory.tabs.counts' },
          { to: '/inventory/item-card', labelKey: 'inventory.tabs.itemCard' },
          { to: '/inventory/valuation', labelKey: 'inventory.tabs.valuation' },
          { to: '/inventory/low-stock', labelKey: 'inventory.tabs.lowStock' },
          { to: '/inventory/expiry', labelKey: 'inventory.tabs.expiry' },
          { to: '/inventory/landed-costs', labelKey: 'inventory.tabs.landedCosts' },
        ],
      },
      { to: '/pos', labelKey: 'nav.pos', icon: MonitorSmartphone, permission: 'sales.manage' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.groups.finance',
    items: [
      {
        to: '/accounting',
        labelKey: 'nav.accounting',
        icon: Calculator,
        permission: 'accounting.manage',
        feature: 'accounting',
        children: [
          { to: '/accounting/chart-of-accounts', labelKey: 'accounting.tabs.chartOfAccounts' },
          { to: '/accounting/journal-entries', labelKey: 'accounting.tabs.journalEntries' },
          { to: '/accounting/reports', labelKey: 'accounting.tabs.reports' },
          { to: '/accounting/bank-accounts', labelKey: 'accounting.tabs.bankAccounts' },
          { to: '/accounting/cost-centers', labelKey: 'accounting.tabs.costCenters' },
          { to: '/accounting/fiscal-years', labelKey: 'accounting.tabs.fiscalYears' },
          { to: '/accounting/settings', labelKey: 'accounting.tabs.settings' },
        ],
      },
    ],
  },
  {
    key: 'admin',
    labelKey: 'nav.groups.admin',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: Users, permission: 'users.manage' },
      { to: '/roles', labelKey: 'nav.roles', icon: ShieldCheck, permission: 'roles.manage' },
      { to: '/audit-logs', labelKey: 'nav.auditLogs', icon: History, permission: 'audit_logs.view' },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

/** Flat list of every top-level item (kept for callers that don't care about groups). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Routes that aren't in the sidebar but still need a breadcrumb label. */
export const EXTRA_ROUTE_LABELS: Record<string, string> = {
  '/profile': 'profile.title',
};

export interface Crumb {
  to: string;
  labelKey: string;
}

/** Breadcrumb trail for a pathname: Home › section › sub-section. */
export function getBreadcrumbs(pathname: string): Crumb[] {
  const home: Crumb = { to: '/', labelKey: 'nav.home' };
  if (pathname === '/') return [home];

  for (const item of NAV_ITEMS) {
    if (item.to === '/') continue;
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      const trail: Crumb[] = [home, { to: item.to, labelKey: item.labelKey }];
      const child = item.children?.find((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
      if (child) {
        trail.push({ to: child.to, labelKey: child.labelKey });
        // A document page under a list (…/new or …/:id).
        if (pathname !== child.to) {
          trail.push({
            to: pathname,
            labelKey: pathname.endsWith('/new') ? 'documents.crumbNew' : 'documents.crumbDetails',
          });
        }
      }
      return trail;
    }
  }

  const extra = EXTRA_ROUTE_LABELS[pathname];
  return extra ? [home, { to: pathname, labelKey: extra }] : [home];
}

export function isPathActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}
