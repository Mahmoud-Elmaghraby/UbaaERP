/**
 * Sales and Purchases permission keys (migration 0117 replaced the single coarse 'sales.manage' and
 * 'purchases.manage'). Split the way Qoyod and Wafeq split document work: who may look, who may
 * prepare drafts, who may post (the step that moves stock, money or the ledger), who may cancel or
 * delete, who sees reports, and who changes the module's set-up. POS selling is its own key so a
 * cashier needs nothing else. One place for the API; the web keeps the same literals in
 * apps/web/src/lib/permissions.ts.
 */
export const SALES_PERMISSIONS = {
  view: 'sales.view',
  create: 'sales.create',
  post: 'sales.post',
  cancel: 'sales.cancel',
  reportsView: 'sales.reports.view',
  settingsManage: 'sales.settings.manage',
  posUse: 'pos.use',
  posSupervise: 'pos.supervise',
  overrideCreditLimit: 'sales.override_credit_limit',
} as const;

export const PURCHASES_PERMISSIONS = {
  view: 'purchases.view',
  create: 'purchases.create',
  post: 'purchases.post',
  cancel: 'purchases.cancel',
  reportsView: 'purchases.reports.view',
  settingsManage: 'purchases.settings.manage',
  approve: 'purchases.approve',
} as const;
