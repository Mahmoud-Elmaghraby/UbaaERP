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
import { EXCHANGE_RATE_REPOSITORY } from './application/ports/exchange-rate.repository';
import { EXCHANGE_RATE_PROVIDER } from './application/ports/exchange-rate-provider';

import { KyselyChartOfAccountRepository } from './infrastructure/persistence/kysely-chart-of-account.repository';
import { KyselyFiscalYearRepository } from './infrastructure/persistence/kysely-fiscal-year.repository';
import { KyselyAccountingPeriodRepository } from './infrastructure/persistence/kysely-accounting-period.repository';
import { KyselyJournalEntryRepository } from './infrastructure/persistence/kysely-journal-entry.repository';
import { KyselyJournalEntryLineRepository } from './infrastructure/persistence/kysely-journal-entry-line.repository';
import { KyselyAccountingSettingsRepository } from './infrastructure/persistence/kysely-accounting-settings.repository';
import { KyselyCostCenterRepository } from './infrastructure/persistence/kysely-cost-center.repository';
import { KyselyBankAccountRepository } from './infrastructure/persistence/kysely-bank-account.repository';
import { KyselyExchangeRateRepository } from './infrastructure/persistence/kysely-exchange-rate.repository';
import { FrankfurterExchangeRateProvider } from './infrastructure/external/frankfurter-exchange-rate.provider';

import { ChartOfAccountsService } from './application/services/chart-of-accounts.service';
import { FiscalYearsService } from './application/services/fiscal-years.service';
import { AccountingPeriodsService } from './application/services/accounting-periods.service';
import { JournalEntriesService } from './application/services/journal-entries.service';
import { AccountingReportsService } from './application/services/accounting-reports.service';
import { AccountingSettingsService } from './application/services/accounting-settings.service';
import { CostCentersService } from './application/services/cost-centers.service';
import { BankAccountsService } from './application/services/bank-accounts.service';
import { ExchangeRatesService } from './application/services/exchange-rates.service';
import { ExchangeRateSyncService } from './application/services/exchange-rate-sync.service';
import { CurrencyConversionService } from './application/services/currency-conversion.service';

import { ChartOfAccountsController } from './presentation/chart-of-accounts.controller';
import { FiscalYearsController } from './presentation/fiscal-years.controller';
import { AccountingPeriodsController } from './presentation/accounting-periods.controller';
import { JournalEntriesController } from './presentation/journal-entries.controller';
import { AccountingReportsController } from './presentation/accounting-reports.controller';
import { AccountingSettingsController } from './presentation/accounting-settings.controller';
import { CostCentersController } from './presentation/cost-centers.controller';
import { BankAccountsController } from './presentation/bank-accounts.controller';
import { ExchangeRatesController } from './presentation/exchange-rates.controller';

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
 *  7. Multi-currency Phase 1 (done) — see claude/multi-currency-strategy.md
 *     for the full research, confirmed scope decisions, and phase plan.
 *     Infrastructure only, no behavioral change: ExchangeRatesController/
 *     Service (manual rate entry only; migration 0072's exchange_rates is
 *     an append-only quote ledger, no update/delete) and
 *     CurrencyConversionService (converts a Money value using the most
 *     recent applicable rate — built and unit-testable, but not called
 *     from anywhere yet). AccountingSettings (migration 0073) gained
 *     exchangeGainLossAccountId (not auto-populated, same treatment as
 *     purchaseExpenseAccountId).
 *  7b. Multi-currency Phase 2 (done, this pass) — live-rate sync.
 *     ExchangeRatesController gained POST /exchange-rates/sync:
 *     ExchangeRateSyncService asks the injected ExchangeRateProvider
 *     (FrankfurterExchangeRateProvider — frankfurter.dev v2, see that
 *     class's own comment for why v2 and not the originally-confirmed
 *     v1/frankfurter.app, which turned out not to support EGP at all —
 *     strategy doc §3.7) for today's rate per requested currency against
 *     the tenant's own base currency, and writes it straight into
 *     exchange_rates with source='api' via the repository, bypassing
 *     ExchangeRatesService's human-input validation. No scheduler is
 *     wired up (no @nestjs/schedule dependency in this project, and
 *     adding one wasn't justified for this pass) — sync is on-demand for
 *     now, safely re-callable (a same-day duplicate comes back as
 *     status: 'already_up_to_date', not an error). A provider failure or
 *     an unsupported currency never throws — it comes back as status:
 *     'unavailable', leaving CurrencyConversionService's own
 *     EXCHANGE_RATE.NOT_AVAILABLE error and the manual-entry endpoint as
 *     the fallback, exactly as decided in the strategy doc's §5.
 *  7c. Multi-currency Phase 3 (done, this pass) — the critical finding
 *     from claude/multi-currency-strategy.md §1 is now actually fixed,
 *     not just diagnosed. AccountingAutoPostingListeners gained
 *     convertToTenantCurrency() (see that method's own comment) and
 *     its three handlers whose source amount can legitimately be a
 *     foreign currency — sales/purchase invoice posting and a sales
 *     credit note issued against a foreign-currency invoice — now
 *     route through CurrencyConversionService before building any
 *     journal line, using the source event's own date to look up the
 *     rate (locking the conversion to the moment the document was
 *     posted, not whenever the Outbox dispatcher happens to process
 *     it). For the default (multi-currency off) tenant this is a
 *     provable no-op: the conversion call short-circuits to rate "1"
 *     whenever the source currency already equals the tenant's own.
 *     Deliberately NOT touched: the stock-consumption/restoration and
 *     POS-variance handlers (their source amounts were never a
 *     document currency in the first place) and Phase 4/5 (realized
 *     gain/loss at settlement, periodic unrealized revaluation) — both
 *     remain separate, later items per the strategy doc's own phase
 *     plan. A related, NOT-yet-investigated question surfaced while
 *     scoping this pass: whether a foreign-currency Purchase Order
 *     could itself skew Inventory's weighted-average cost basis before
 *     it ever reaches this class — flagged in
 *     claude/next-steps-backlog.md, not fixed here.
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
    ExchangeRatesController,
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
    { provide: EXCHANGE_RATE_REPOSITORY, useClass: KyselyExchangeRateRepository },
    { provide: EXCHANGE_RATE_PROVIDER, useClass: FrankfurterExchangeRateProvider },
    ChartOfAccountsService,
    FiscalYearsService,
    AccountingPeriodsService,
    JournalEntriesService,
    AccountingReportsService,
    AccountingSettingsService,
    CostCentersService,
    BankAccountsService,
    ExchangeRatesService,
    ExchangeRateSyncService,
    CurrencyConversionService,
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
    ExchangeRatesService,
    ExchangeRateSyncService,
    CurrencyConversionService,
  ],
})
export class AccountingModule {}
