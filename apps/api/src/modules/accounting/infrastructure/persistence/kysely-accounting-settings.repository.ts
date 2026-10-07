import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { TenantDatabase, AccountingSettingsTable } from '../../../../database/tenant/kysely-client';
import type { AccountingSettingsRepository } from '../../application/ports/accounting-settings.repository';
import type { AccountingSettings, UpdateAccountingSettingsInput } from '../../domain/accounting-settings.entity';
import { isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';

function toDomain(row: Selectable<AccountingSettingsTable>): AccountingSettings {
  return {
    id: row.id,
    accountsReceivableAccountId: row.accounts_receivable_account_id,
    inventoryAccountId: row.inventory_account_id,
    cogsAccountId: row.cogs_account_id,
    salesReturnsContraAccountId: row.sales_returns_contra_account_id,
    revenueAccountId: row.revenue_account_id,
    accountsPayableAccountId: row.accounts_payable_account_id,
    purchaseExpenseAccountId: row.purchase_expense_account_id,
    cashAccountId: row.cash_account_id,
    cashOverShortAccountId: row.cash_over_short_account_id,
    exchangeGainLossAccountId: row.exchange_gain_loss_account_id,
    grniAccountId: row.grni_account_id,
    inventoryAdjustmentAccountId: row.inventory_adjustment_account_id,
    openingBalanceEquityAccountId: row.opening_balance_equity_account_id,
    landedCostClearingAccountId: row.landed_cost_clearing_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The default template's own codes for each purpose (migration 0048) —
 * see migration 0052's own comment. purchase_expense_account_id is
 * deliberately absent here — migration 0054's comment explains why it
 * has no safe default to auto-populate from.
 */
const DEFAULT_CODES = {
  accounts_receivable_account_id: '113',
  inventory_account_id: '114',
  cogs_account_id: '51',
  sales_returns_contra_account_id: '42',
  revenue_account_id: '41',
  accounts_payable_account_id: '211',
  cash_account_id: '111',
  grni_account_id: '217',
  inventory_adjustment_account_id: '54',
  opening_balance_equity_account_id: '35',
} as const;

export class KyselyAccountingSettingsRepository implements AccountingSettingsRepository {
  async getOrCreate(db: Kysely<TenantDatabase>): Promise<AccountingSettings> {
    const existing = await db.selectFrom('accounting_settings').selectAll().executeTakeFirst();
    if (existing) return toDomain(existing);

    // Resolve each purpose's known default code to whatever account currently
    // has that code — NULL if the tenant already renamed/deleted it (see
    // migration 0052's comment: a mapping is allowed to go stale).
    const codes = Object.values(DEFAULT_CODES);
    const rows = await db
      .selectFrom('chart_of_accounts')
      .select(['id', 'code'])
      .where('code', 'in', codes)
      .execute();
    const accountIdByCode = new Map(rows.map((row) => [row.code, row.id]));

    try {
      const created = await db
        .insertInto('accounting_settings')
        .values({
          id: randomUUID(),
          singleton: true,
          accounts_receivable_account_id: accountIdByCode.get(DEFAULT_CODES.accounts_receivable_account_id) ?? null,
          inventory_account_id: accountIdByCode.get(DEFAULT_CODES.inventory_account_id) ?? null,
          cogs_account_id: accountIdByCode.get(DEFAULT_CODES.cogs_account_id) ?? null,
          sales_returns_contra_account_id: accountIdByCode.get(DEFAULT_CODES.sales_returns_contra_account_id) ?? null,
          revenue_account_id: accountIdByCode.get(DEFAULT_CODES.revenue_account_id) ?? null,
          accounts_payable_account_id: accountIdByCode.get(DEFAULT_CODES.accounts_payable_account_id) ?? null,
          purchase_expense_account_id: null,
          cash_account_id: accountIdByCode.get(DEFAULT_CODES.cash_account_id) ?? null,
          cash_over_short_account_id: null,
          exchange_gain_loss_account_id: null,
          grni_account_id: accountIdByCode.get(DEFAULT_CODES.grni_account_id) ?? null,
          inventory_adjustment_account_id: accountIdByCode.get(DEFAULT_CODES.inventory_adjustment_account_id) ?? null,
          opening_balance_equity_account_id: accountIdByCode.get(DEFAULT_CODES.opening_balance_equity_account_id) ?? null,
          landed_cost_clearing_account_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(created);
    } catch (err) {
      // Same concurrent-getOrCreate race as KyselyTenantSettingsRepository —
      // the UNIQUE(singleton) constraint makes a second INSERT fail; re-read
      // the row the other caller just created instead of propagating.
      if (!isPostgresUniqueViolation(err)) throw err;
      const row = await db.selectFrom('accounting_settings').selectAll().executeTakeFirstOrThrow();
      return toDomain(row);
    }
  }

  async update(db: Kysely<TenantDatabase>, input: UpdateAccountingSettingsInput): Promise<AccountingSettings> {
    const settings = await this.getOrCreate(db);

    const updated = await db
      .updateTable('accounting_settings')
      .set({
        ...(input.accountsReceivableAccountId !== undefined
          ? { accounts_receivable_account_id: input.accountsReceivableAccountId }
          : {}),
        ...(input.inventoryAccountId !== undefined ? { inventory_account_id: input.inventoryAccountId } : {}),
        ...(input.cogsAccountId !== undefined ? { cogs_account_id: input.cogsAccountId } : {}),
        ...(input.salesReturnsContraAccountId !== undefined
          ? { sales_returns_contra_account_id: input.salesReturnsContraAccountId }
          : {}),
        ...(input.revenueAccountId !== undefined ? { revenue_account_id: input.revenueAccountId } : {}),
        ...(input.accountsPayableAccountId !== undefined
          ? { accounts_payable_account_id: input.accountsPayableAccountId }
          : {}),
        ...(input.purchaseExpenseAccountId !== undefined
          ? { purchase_expense_account_id: input.purchaseExpenseAccountId }
          : {}),
        ...(input.cashAccountId !== undefined ? { cash_account_id: input.cashAccountId } : {}),
        ...(input.cashOverShortAccountId !== undefined
          ? { cash_over_short_account_id: input.cashOverShortAccountId }
          : {}),
        ...(input.exchangeGainLossAccountId !== undefined
          ? { exchange_gain_loss_account_id: input.exchangeGainLossAccountId }
          : {}),
        ...(input.grniAccountId !== undefined ? { grni_account_id: input.grniAccountId } : {}),
        ...(input.inventoryAdjustmentAccountId !== undefined
          ? { inventory_adjustment_account_id: input.inventoryAdjustmentAccountId }
          : {}),
        ...(input.openingBalanceEquityAccountId !== undefined
          ? { opening_balance_equity_account_id: input.openingBalanceEquityAccountId }
          : {}),
        ...(input.landedCostClearingAccountId !== undefined
          ? { landed_cost_clearing_account_id: input.landedCostClearingAccountId }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', settings.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(updated);
  }
}
