export interface NavItem {
  to: string;
  labelKey: string;
  /** Permission key required to see this item — omit for permission-free items. Applies to
   * the whole group (item + children): sub-sections don't have their own permission in this
   * MVP, `inventory.manage` covers all of Inventory's sub-sections together. */
  permission?: string;
  /** Sub-sections rendered as a nested list under this item, expanded whenever the current
   * route is this item's path or a descendant of it (see AppShell). */
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/settings', labelKey: 'nav.settings', permission: 'settings.manage' },
  { to: '/pos', labelKey: 'nav.pos', permission: 'sales.manage' },
  {
    to: '/inventory',
    labelKey: 'nav.inventory',
    permission: 'inventory.manage',
    children: [
      { to: '/inventory/products', labelKey: 'inventory.tabs.products' },
      { to: '/inventory/warehouses', labelKey: 'inventory.tabs.warehouses' },
      { to: '/inventory/units-of-measure', labelKey: 'inventory.tabs.unitsOfMeasure' },
      { to: '/inventory/stock', labelKey: 'inventory.tabs.stock' },
      { to: '/inventory/landed-costs', labelKey: 'inventory.tabs.landedCosts' },
    ],
  },
  {
    to: '/purchases',
    labelKey: 'nav.purchases',
    permission: 'purchases.manage',
    children: [
      { to: '/purchases/suppliers', labelKey: 'purchases.tabs.suppliers' },
      { to: '/purchases/purchase-requisitions', labelKey: 'purchases.tabs.purchaseRequisitions' },
      { to: '/purchases/rfqs', labelKey: 'purchases.tabs.rfqs' },
      { to: '/purchases/purchase-orders', labelKey: 'purchases.tabs.purchaseOrders' },
      { to: '/purchases/goods-receipts', labelKey: 'purchases.tabs.goodsReceipts' },
      { to: '/purchases/purchase-returns', labelKey: 'purchases.tabs.purchaseReturns' },
      { to: '/purchases/purchase-invoices', labelKey: 'purchases.tabs.purchaseInvoices' },
    ],
  },
  {
    to: '/sales',
    labelKey: 'nav.sales',
    permission: 'sales.manage',
    children: [
      { to: '/sales/customers', labelKey: 'sales.tabs.customers' },
      { to: '/sales/quotations', labelKey: 'sales.tabs.quotations' },
      { to: '/sales/sales-orders', labelKey: 'sales.tabs.salesOrders' },
      { to: '/sales/deliveries', labelKey: 'sales.tabs.deliveries' },
      { to: '/sales/sales-invoices', labelKey: 'sales.tabs.salesInvoices' },
      { to: '/sales/payments-received', labelKey: 'sales.tabs.paymentsReceived' },
      { to: '/sales/sales-returns', labelKey: 'sales.tabs.salesReturns' },
      { to: '/sales/sales-credit-notes', labelKey: 'sales.tabs.salesCreditNotes' },
      { to: '/sales/eta-credentials', labelKey: 'sales.tabs.etaCredentials' },
    ],
  },
  {
    to: '/accounting',
    labelKey: 'nav.accounting',
    permission: 'accounting.manage',
    children: [
      { to: '/accounting/chart-of-accounts', labelKey: 'accounting.tabs.chartOfAccounts' },
      { to: '/accounting/fiscal-years', labelKey: 'accounting.tabs.fiscalYears' },
      { to: '/accounting/journal-entries', labelKey: 'accounting.tabs.journalEntries' },
      { to: '/accounting/reports', labelKey: 'accounting.tabs.reports' },
      { to: '/accounting/settings', labelKey: 'accounting.tabs.settings' },
      { to: '/accounting/cost-centers', labelKey: 'accounting.tabs.costCenters' },
      { to: '/accounting/bank-accounts', labelKey: 'accounting.tabs.bankAccounts' },
    ],
  },
  { to: '/users', labelKey: 'nav.users', permission: 'users.manage' },
  { to: '/roles', labelKey: 'nav.roles', permission: 'roles.manage' },
  { to: '/audit-logs', labelKey: 'nav.auditLogs', permission: 'audit_logs.view' },
];
