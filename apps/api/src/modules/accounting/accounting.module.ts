import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CHART_OF_ACCOUNT_REPOSITORY } from './application/ports/chart-of-account.repository';
import { FISCAL_YEAR_REPOSITORY } from './application/ports/fiscal-year.repository';
import { ACCOUNTING_PERIOD_REPOSITORY } from './application/ports/accounting-period.repository';
import { JOURNAL_ENTRY_REPOSITORY } from './application/ports/journal-entry.repository';
import { JOURNAL_ENTRY_LINE_REPOSITORY } from './application/ports/journal-entry-line.repository';
import { ACCOUNTING_SETTINGS_REPOSITORY } from './application/ports/accounting-settings.repository';
import { COST_CENTER_REPOSITORY } from './application/ports/cost-center.repository';
import { BANK_ACCOUNT_REPOSITORY } from './application/ports/bank-account.repository';

import { KyselyChartOfAccountRepository } from './infrastructure/persistence/kysely-chart-of-account.repository';
import { KyselyFiscalYearRepository } from './infrastructure/persistence/kysely-fiscal-year.repository';
import { KyselyAccountingPeriodRepository } from './infrastructure/persistence/kysely-accounting-period.repository';
import { KyselyJournalEntryRepository } from './infrastructure/persistence/kysely-journal-entry.repository';
import { KyselyJournalEntryLineRepository } from './infrastructure/persistence/kysely-journal-entry-line.repository';
import { KyselyAccountingSettingsRepository } from './infrastructure/persistence/kysely-accounting-settings.repository';
import { KyselyCostCenterRepository } from './infrastructure/persistence/kysely-cost-center.repository';
import { KyselyBankAccountRepository } from './infrastructure/persistence/kysely-bank-account.repository';

import { ChartOfAccountsService } from './application/services/chart-of-accounts.service';
import { FiscalYearsService } from './application/services/fiscal-years.service';
import { AccountingPeriodsService } from './application/services/accounting-periods.service';
import { JournalEntriesService } from './application/services/journal-entries.service';
import { AccountingReportsService } from './application/services/accounting-reports.service';
import { AccountingSettingsService } from './application/services/accounting-settings.service';
import { CostCentersService } from './application/services/cost-centers.service';
import { BankAccountsService } from './application/services/bank-accounts.service';

import { ChartOfAccountsController } from './presentation/chart-of-accounts.controller';
import { FiscalYearsController } from './presentation/fiscal-years.controller';
import { AccountingPeriodsController } from './presentation/accounting-periods.controller';
import { JournalEntriesController } from './presentation/journal-entries.controller';
import { AccountingReportsController } from './presentation/accounting-reports.controller';
import { AccountingSettingsController } from './presentation/accounting-settings.controller';
import { CostCentersController } from './presentation/cost-centers.controller';
import { BankAccountsController } from './presentation/bank-accounts.controller';

import { AccountingEventPublisher } from './infrastructure/events/accounting-event-publisher';
import { AccountingAutoPostingListeners } from './infrastructure/events/accounting-auto-posting.listeners';

/**
 * Accounting module (CLAUDE.md §10: step 5, the last module in the fixed
 * build order). See claude/accounting-module-status.md for full detail
 * and what's next:
 *  1. Chart of Accounts + Fiscal Years/Accounting Periods (done) — the
 *     foundational tree and period-close plumbing every later Accounting
 *     entity sits on top of.
 *  2. Journal Entries (done) — the actual double-entry ledger: manual
 *     entries only, draft/posted/cancelled lifecycle, reversal-not-void
 *     for posted entries.
 *  2b. Reports (done) — General Ledger, Trial Balance, Income
 *     Statement, Balance Sheet. All computed on read from
 *     journal_entry_lines + chart_of_accounts; none back a stored table.
 *  6/7. Auto-posting listeners (done) — the first @OnEvent listeners
 *     this module has: AccountingAutoPostingListeners reacts to
 *     Inventory's 'inventory.stock_consumption.recorded'/
 *     'inventory.stock_restoration.recorded' events (COGS recognition
 *     and its reversal) and to Sales' 'sales.sales_credit_note.issued'
 *     event (revenue reversal for a confirmed Sales Return), each
 *     creating + posting one journal entry via
 *     JournalEntriesService.createAuto(). AccountingSettingsService
 *     (see migration 0052) is the default-account mapping these
 *     listeners read from, GET+PATCH via AccountingSettingsController.
 *  3. Sales/Purchases invoice auto-posting (done, this pass) —
 *     AccountingAutoPostingListeners gained two more @OnEvent handlers
 *     reacting to 'sales.sales_invoice.posted' (debit Accounts
 *     Receivable / credit Revenue) and 'purchases.purchase_invoice
 *     .posted' (debit Purchase Expense / credit Accounts Payable) —
 *     both already Outbox-backed since Sales/Purchases' own earlier
 *     stages, so no upstream event-publishing change was needed.
 *     AccountingSettings (migration 0054) gained three more mappings:
 *     revenueAccountId and accountsPayableAccountId are auto-populated
 *     from the default template same as the Stage 6/7 fields;
 *     purchaseExpenseAccountId is not — no generic "purchases expense"
 *     leaf account exists in the seeded template, so it starts NULL and
 *     the purchase-invoice handler fails loudly until a tenant admin
 *     configures it.
 *  4. Cost Centers (done, this pass) — a flat tagging dimension, NOT a
 *     tree like chart_of_accounts. CostCentersController/Service, plain
 *     CRUD. journal_entry_lines gained an optional cost_center_id
 *     (migration 0056) — JournalEntryLineItemsEditor (frontend) exposes
 *     it as an optional per-line tag; no report yet filters or
 *     breaks down by cost center (deliberately out of scope for this
 *     pass — see claude/accounting-module-status.md).
 *  5. Bank Accounts (done, this pass) — BankAccountsController/Service.
 *     Each bank account links to exactly one chart_of_accounts leaf
 *     (migration 0058); its "register" is that account's own posted
 *     journal_entry_lines, read via the same
 *     JournalEntryLineRepository.listPostedByAccount() the general
 *     ledger report uses. Reconciliation is basic: journal_entry_lines
 *     gained is_reconciled/reconciled_at (migration 0057), toggled via
 *     POST :id/lines/:lineId/reconcile|unreconcile — no statement-import
 *     reconciliation, matching the roadmap's own "basic ... not full"
 *     scoping.
 *  6. POS feature Stage 1 (done, this pass) — AccountingAutoPostingListeners
 *     gained a sixth @OnEvent handler, handlePosSessionClosed(),
 *     reacting to Sales' 'sales.pos_session.closed' (see
 *     claude/sales-pos-research.md and PosSessionsService.close()'s own
 *     comment) — debit/credit Cash vs Cash Over/Short depending on
 *     whether a closed session's counted cash was over or short.
 *     AccountingSettings (migration 0061) gained cashAccountId
 *     (auto-populated from the default template, code '111') and
 *     cashOverShortAccountId (not auto-populated — no generic template
 *     leaf for it, same treatment as purchaseExpenseAccountId).
 *
 * SettingsModule is imported for NumberingSequencesService (numbered
 * "JE-0001"-style entryNumbers) and TenantSettingsService (the tenant's
 * one base ledger currency) — see journal-entry.entity.ts's own comment.
 *
 * TenantConnectionManager comes from the global TenancyModule — not
 * re-provided here, same as every other business module.
 *
 * PlanFeatureGuard (FEATURE_KEYS.ACCOUNTING) closes the long-flagged
 * gap this comment used to describe — see ChartOfAccountsController's
 * class comment. Every controller in this module carries it. Sales/
 * Purchases now also carry it on their optional document-chain
 * controllers (Quotations/Sales Orders/Deliveries and RFQ/Supplier
 * Quotations/Purchase Orders/Goods Receipts) — see those modules'
 * own class comments. Customers/Suppliers, Invoices, Payments
 * Received, Returns/Credit Notes, POS and Inventory controllers do
 * not carry it yet (tracked, not forgotten).
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    ChartOfAccountsController,
    FiscalYearsController,
    AccountingPeriodsController,
    JournalEntriesController,
    AccountingReportsController,
    AccountingSettingsController,
    CostCentersController,
    BankAccountsController,
  ],
  providers: [
    { provide: CHART_OF_ACCOUNT_REPOSITORY, useClass: KyselyChartOfAccountRepository },
    { provide: FISCAL_YEAR_REPOSITORY, useClass: KyselyFiscalYearRepository },
    { provide: ACCOUNTING_PERIOD_REPOSITORY, useClass: KyselyAccountingPeriodRepository },
    { provide: JOURNAL_ENTRY_REPOSITORY, useClass: KyselyJournalEntryRepository },
    { provide: JOURNAL_ENTRY_LINE_REPOSITORY, useClass: KyselyJournalEntryLineRepository },
    { provide: ACCOUNTING_SETTINGS_REPOSITORY, useClass: KyselyAccountingSettingsRepository },
    { provide: COST_CENTER_REPOSITORY, useClass: KyselyCostCenterRepository },
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: KyselyBankAccountRepository },
    ChartOfAccountsService,
    FiscalYearsService,
    AccountingPeriodsService,
    JournalEntriesService,
    AccountingReportsService,
    AccountingSettingsService,
    CostCentersService,
    BankAccountsService,
    AccountingEventPublisher,
    AccountingAutoPostingListeners,
  ],
  exports: [
    ChartOfAccountsService,
    FiscalYearsService,
    AccountingPeriodsService,
    JournalEntriesService,
    AccountingReportsService,
    AccountingSettingsService,
    CostCentersService,
    BankAccountsService,
  ],
})
export class AccountingModule {}
