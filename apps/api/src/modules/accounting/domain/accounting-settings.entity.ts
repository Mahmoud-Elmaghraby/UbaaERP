/**
 * Default-account mapping (CLAUDE.md §10 — step 5, Accounting, Stages
 * 6/7 and 3). See migration 0052's own comment for the original four
 * purposes, and migration 0054's for the three added in Stage 3
 * (Sales/Purchases invoice auto-posting) — still a true singleton, same
 * shape as TenantSettings, deliberately just the named purposes the
 * auto-posting listeners built so far actually need, not a generic
 * open-ended mapping table.
 *
 * purchaseExpenseAccountId, cashOverShortAccountId and
 * exchangeGainLossAccountId started out never auto-populated (migrations
 * 0054/0061/0073); since migration 0088 they default to the dedicated
 * accounts 55/56/57 (see that migration for why).
 *
 * cashAccountId/cashOverShortAccountId (migration 0061 — POS feature
 * Stage 1, claude/sales-pos-research.md) follow the exact same
 * pattern as the pair above: cashAccountId auto-populates from the
 * default template's code '111', cashOverShortAccountId never does.
 *
 * exchangeGainLossAccountId (migration 0073 — multi-currency Phase 1,
 * claude/multi-currency-strategy.md) follows the same never-auto-
 * populated treatment as purchaseExpenseAccountId/
 * cashOverShortAccountId; unused until Phase 4 wires realized
 * exchange gain/loss posting on foreign-currency invoice settlement.
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
  exchangeGainLossAccountId: string | null;
  /** Migration 0084: goods received not invoiced — receipts credit it, purchase invoices clear it. */
  grniAccountId: string | null;
  /** Migration 0084: default counter-account of stock adjustments, count differences and transfer shortages. */
  inventoryAdjustmentAccountId: string | null;
  /** Migration 0084: opening stock balances. */
  openingBalanceEquityAccountId: string | null;
  /** Migration 0084: landed costs are credited here; null = purchaseExpenseAccountId. */
  landedCostClearingAccountId: string | null;
  /** Migration 0089: non-cash receipts/payments when no bank account was chosen (default 112). */
  defaultBankAccountId: string | null;
  /** Migration 0091: invoice taxes (see that migration). */
  vatOutputAccountId: string | null;
  vatInputAccountId: string | null;
  tableTaxOutputAccountId: string | null;
  tableTaxInputAccountId: string | null;
  withholdingPayableAccountId: string | null;
  withholdingReceivableAccountId: string | null;
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
  exchangeGainLossAccountId?: string | null;
  grniAccountId?: string | null;
  inventoryAdjustmentAccountId?: string | null;
  openingBalanceEquityAccountId?: string | null;
  landedCostClearingAccountId?: string | null;
  defaultBankAccountId?: string | null;
  vatOutputAccountId?: string | null;
  vatInputAccountId?: string | null;
  tableTaxOutputAccountId?: string | null;
  tableTaxInputAccountId?: string | null;
  withholdingPayableAccountId?: string | null;
  withholdingReceivableAccountId?: string | null;
}
