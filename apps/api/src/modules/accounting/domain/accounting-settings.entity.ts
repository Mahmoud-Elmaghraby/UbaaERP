/**
 * Default-account mapping (CLAUDE.md §10 — step 5, Accounting, Stages
 * 6/7 and 3). See migration 0052's own comment for the original four
 * purposes, and migration 0054's for the three added in Stage 3
 * (Sales/Purchases invoice auto-posting) — still a true singleton, same
 * shape as TenantSettings, deliberately just the named purposes the
 * auto-posting listeners built so far actually need, not a generic
 * open-ended mapping table.
 *
 * purchaseExpenseAccountId is never auto-populated (see migration
 * 0054's comment) — it legitimately starts NULL and stays that way
 * until a tenant admin configures it here.
 *
 * cashAccountId/cashOverShortAccountId (migration 0061 — POS feature
 * Stage 1, claude/sales-pos-research.md) follow the exact same
 * pattern as the pair above: cashAccountId auto-populates from the
 * default template's code '111', cashOverShortAccountId never does.
 */
export interface AccountingSettings {
  id: string;
  accountsReceivableAccountId: string | null;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  salesReturnsContraAccountId: string | null;
  revenueAccountId: string | null;
  accountsPayableAccountId: string | null;
  purchaseExpenseAccountId: string | null;
  cashAccountId: string | null;
  cashOverShortAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateAccountingSettingsInput {
  accountsReceivableAccountId?: string | null;
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  salesReturnsContraAccountId?: string | null;
  revenueAccountId?: string | null;
  accountsPayableAccountId?: string | null;
  purchaseExpenseAccountId?: string | null;
  cashAccountId?: string | null;
  cashOverShortAccountId?: string | null;
}
