import type { LucideIcon } from 'lucide-react';

import { ANY_HR_PERMISSION, ANY_INVENTORY_PERMISSION, ANY_PURCHASES_PERMISSION, ANY_SALES_PERMISSION, INV, PURCH, SALES } from '../../lib/permissions';
import {
  Calculator,
  History,
  IdCard,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon?: LucideIcon;
  /** Permission key(s) required to see this item — any one of them is enough. Omit for
   * permission-free items. On a parent it gates the whole group; children can narrow it
   * further with their own key(s). */
  permission?: string | string[];
  /** Plan feature key (see lib/feature-keys.ts) — hidden when the tenant doesn't have it
   * or turned it off. UX only; the API enforces it (PlanFeatureGuard). */
  feature?: string;
  /** Sub-sections rendered as a nested list under this item, expanded whenever the current
   * route is this item's path or a descendant of it (see AppShell). */
  children?: NavItem[];
  /** The module's own settings page — a gear next to the item in the sidebar. */
  settings?: { to: string; permission?: string | string[] };
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
        settings: { to: '/settings/sales', permission: ['settings.manage', 'sales.settings.manage'] },
        labelKey: 'nav.sales',
        icon: ShoppingCart,
        permission: ANY_SALES_PERMISSION,
        children: [
          { to: '/sales/customers', permission: SALES.view, labelKey: 'sales.tabs.customers' },
          { to: '/sales/receivables', permission: SALES.view, labelKey: 'statements.balances.title.customer' },
          { to: '/sales/price-lists', permission: [SALES.view, SALES.settingsManage], labelKey: 'priceLists.nav' },
          { to: '/sales/sales-reps', permission: [SALES.view, SALES.settingsManage], labelKey: 'salesReps.nav', feature: 'sales.reps' },
          { to: '/sales/quotations', permission: SALES.view, labelKey: 'sales.tabs.quotations', feature: 'sales.quotations' },
          { to: '/sales/sales-orders', permission: SALES.view, labelKey: 'sales.tabs.salesOrders', feature: 'sales.sales_orders' },
          { to: '/sales/deliveries', permission: SALES.view, labelKey: 'sales.tabs.deliveries', feature: 'sales.deliveries' },
          { to: '/sales/sales-invoices', permission: SALES.view, labelKey: 'sales.tabs.salesInvoices' },
          { to: '/sales/payments-received', permission: SALES.view, labelKey: 'sales.tabs.paymentsReceived' },
          { to: '/sales/cheques', permission: SALES.view, labelKey: 'cheques.nav', feature: 'cheques' },
          { to: '/sales/installments-due', permission: SALES.view, labelKey: 'sales.installments.nav', feature: 'sales.installments' },
          { to: '/sales/settlements', permission: SALES.view, labelKey: 'settlements.nav', feature: 'sales.channels' },
          { to: '/sales/channels', permission: [SALES.view, SALES.settingsManage], labelKey: 'channels.nav', feature: 'sales.channels' },
          { to: '/sales/sales-returns', permission: SALES.view, labelKey: 'sales.tabs.salesReturns' },
          { to: '/sales/sales-credit-notes', permission: SALES.view, labelKey: 'sales.tabs.salesCreditNotes' },
          { to: '/sales/reports/analysis', permission: SALES.reportsView, labelKey: 'salesAnalysis.nav' },
          { to: '/sales/eta-credentials', permission: SALES.settingsManage, labelKey: 'sales.tabs.etaCredentials' },
        ],
      },
      {
        to: '/purchases',
        labelKey: 'nav.purchases',
        icon: Truck,
        permission: ANY_PURCHASES_PERMISSION,
        settings: { to: '/settings/purchases', permission: ['settings.manage', 'purchases.settings.manage'] },
        children: [
          { to: '/purchases/suppliers', permission: PURCH.view, labelKey: 'purchases.tabs.suppliers' },
          { to: '/purchases/payables', permission: PURCH.view, labelKey: 'statements.balances.title.supplier' },
          { to: '/purchases/purchase-requisitions', permission: PURCH.view, labelKey: 'purchases.tabs.purchaseRequisitions' },
          { to: '/purchases/rfqs', permission: PURCH.view, labelKey: 'purchases.tabs.rfqs', feature: 'purchases.rfq' },
          {
            to: '/purchases/purchase-orders', permission: PURCH.view,
            labelKey: 'purchases.tabs.purchaseOrders',
            feature: 'purchases.purchase_orders',
          },
          {
            to: '/purchases/goods-receipts', permission: PURCH.view,
            labelKey: 'purchases.tabs.goodsReceipts',
            feature: 'purchases.goods_receipts',
          },
          { to: '/purchases/purchase-returns', permission: PURCH.view, labelKey: 'purchases.tabs.purchaseReturns' },
          { to: '/purchases/debit-notes', permission: PURCH.view, labelKey: 'purchases.tabs.debitNotes' },
          { to: '/purchases/purchase-invoices', permission: PURCH.view, labelKey: 'purchases.tabs.purchaseInvoices' },
          { to: '/purchases/supplier-payments', permission: PURCH.view, labelKey: 'purchases.tabs.supplierPayments' },
          { to: '/purchases/price-lists', permission: [PURCH.view, PURCH.settingsManage], labelKey: 'purchases.tabs.priceLists' },
          { to: '/purchases/reports/analysis', permission: PURCH.reportsView, labelKey: 'purchaseAnalysis.nav' },
        ],
      },
      {
        to: '/inventory',
        settings: { to: '/inventory/settings', permission: ['settings.manage', 'inventory.settings.manage'] },
        labelKey: 'nav.inventory',
        icon: Package,
        permission: ANY_INVENTORY_PERMISSION,
        children: [
          { to: '/inventory/products', labelKey: 'inventory.tabs.products', permission: INV.productsView },
          { to: '/inventory/catalog', labelKey: 'inventory.tabs.catalog', permission: INV.productsView },
          { to: '/inventory/import', labelKey: 'inventory.tabs.import', permission: INV.productsManage },
          { to: '/inventory/labels', labelKey: 'inventory.tabs.labels', permission: INV.productsView },
          { to: '/inventory/stock', labelKey: 'inventory.tabs.stock', permission: INV.stockView },
          {
            to: '/inventory/transfers',
            labelKey: 'inventory.tabs.transfers',
            permission: [INV.transfersManage, INV.transfersApprove],
          },
          {
            to: '/inventory/adjustments',
            labelKey: 'inventory.tabs.adjustments',
            permission: [INV.movementsManage, INV.stockView],
          },
          { to: '/inventory/counts', labelKey: 'inventory.tabs.counts', permission: [INV.countsManage, INV.countsPost] },
          { to: '/inventory/item-card', labelKey: 'inventory.tabs.itemCard', permission: INV.reportsView },
          { to: '/inventory/valuation', labelKey: 'inventory.tabs.valuation', permission: INV.costsView },
          { to: '/inventory/low-stock', labelKey: 'inventory.tabs.lowStock', permission: INV.reportsView },
          { to: '/inventory/movement-analysis', labelKey: 'inventory.tabs.movementAnalysis', permission: INV.reportsView },
          { to: '/inventory/expiry', labelKey: 'inventory.tabs.expiry', permission: INV.reportsView },
          {
            to: '/inventory/lot-trace',
            labelKey: 'inventory.tabs.lotTrace',
            permission: [INV.reportsView, INV.stockView],
          },
          { to: '/inventory/landed-costs', labelKey: 'inventory.tabs.landedCosts', permission: INV.landedCostsManage, feature: 'inventory.landed_costs' },
          {
            to: '/inventory/warehouses',
            labelKey: 'inventory.tabs.warehouses',
            permission: [INV.settingsManage, INV.stockView],
          },
          {
            to: '/inventory/units-of-measure',
            labelKey: 'inventory.tabs.unitsOfMeasure',
            permission: [INV.settingsManage, INV.productsView],
          },
          { to: '/inventory/adjustment-reasons', labelKey: 'inventory.tabs.adjustmentReasons', permission: INV.settingsManage },
        ],
      },
      { to: '/pos', labelKey: 'nav.pos', icon: MonitorSmartphone, permission: SALES.posUse, feature: 'pos' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.groups.finance',
    items: [
      {
        to: '/treasury',
        labelKey: 'treasury.title',
        icon: Wallet,
        permission: ['treasury.view', 'treasury.vouchers.manage'],
        children: [
          { to: '/treasury', labelKey: 'treasury.navTreasuries' },
          { to: '/treasury/vouchers', labelKey: 'treasury.vouchers.title' },
          { to: '/treasury/categories', labelKey: 'treasury.categories.title' },
        ],
      },
      {
        to: '/accounting',
        settings: { to: '/accounting/settings', permission: 'accounting.manage' },
        labelKey: 'nav.accounting',
        icon: Calculator,
        permission: 'accounting.manage',
        feature: 'accounting',
        children: [
          { to: '/accounting', labelKey: 'accounting.tabs.overview' },
          { to: '/accounting/chart-of-accounts', labelKey: 'accounting.tabs.chartOfAccounts' },
          { to: '/accounting/journal-entries', labelKey: 'accounting.tabs.journalEntries' },
          { to: '/accounting/recurring-entries', labelKey: 'accounting.tabs.recurring' },
          { to: '/accounting/reports', labelKey: 'accounting.tabs.reports' },
          { to: '/accounting/bank-accounts', labelKey: 'accounting.tabs.bankReconciliation' },
          { to: '/accounting/fixed-assets', labelKey: 'accounting.tabs.fixedAssets', feature: 'fixed_assets' },
          { to: '/accounting/budgets', labelKey: 'accounting.tabs.budgets', feature: 'budgets' },
          { to: '/accounting/cost-centers', labelKey: 'accounting.tabs.costCenters' },
          { to: '/accounting/fiscal-years', labelKey: 'accounting.tabs.fiscalYears' },
          { to: '/accounting/settings', labelKey: 'accounting.tabs.settings' },
        ],
      },
    ],
  },
  {
    key: 'people',
    labelKey: 'nav.groups.people',
    items: [
      {
        to: '/hr',
        labelKey: 'nav.hr',
        icon: IdCard,
        permission: ANY_HR_PERMISSION,
        feature: 'hr',
        settings: { to: '/settings/hr', permission: ['settings.manage', 'hr.salaries.manage', 'hr.attendance.manage'] },
        children: [
          { to: '/hr/employees', labelKey: 'hr.employees.title' },
          { to: '/hr/departments', labelKey: 'hr.departments.title' },
          { to: '/hr/job-titles', labelKey: 'hr.jobTitles.title' },
          { to: '/hr/attendance', labelKey: 'hr.attendance.title', permission: ['hr.attendance.view', 'hr.attendance.manage'] },
          { to: '/hr/leaves', labelKey: 'hr.leaves.title', permission: ['hr.leaves.view', 'hr.leaves.manage', 'hr.leaves.approve'] },
          { to: '/hr/leave-balances', labelKey: 'hr.leaveBalances.title', permission: ['hr.leaves.view', 'hr.leaves.manage', 'hr.leaves.approve'] },
          { to: '/hr/leave-types', labelKey: 'hr.leaveTypes.title', permission: ['hr.leaves.view', 'hr.leaves.manage'] },
          { to: '/hr/shifts', labelKey: 'hr.shifts.title', permission: ['hr.attendance.view', 'hr.attendance.manage'] },
          { to: '/hr/holidays', labelKey: 'hr.holidays.title', permission: ['hr.attendance.view', 'hr.attendance.manage'] },
          { to: '/hr/salaries', labelKey: 'hr.register.title', permission: ['hr.salaries.view', 'hr.salaries.manage'] },
          { to: '/hr/salary-components', labelKey: 'hr.salaryComponents.title', permission: ['hr.salaries.view', 'hr.salaries.manage'] },
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
      // The most specific child wins (a section's own index page shares the section's path).
      const child = item.children
        ?.filter((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))
        .sort((a, b) => b.to.length - a.to.length)[0];
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
