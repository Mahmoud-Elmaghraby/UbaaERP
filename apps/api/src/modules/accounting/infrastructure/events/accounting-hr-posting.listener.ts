import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { LedgerAmountService } from '../../application/services/ledger-amount.service';
import { requiredAccount, resolveTreasuryAccount } from '../../application/services/treasury-account-resolver';

/** HR's loan money events (see LoansService in the HR module — not imported, CLAUDE.md §2.6). */
interface LoanMoneyMetadata {
  number: string;
  loanNumber: string;
  date: string;
  treasuryId: string;
  employeeName: string;
  amount: { amountMinorUnits: string; currency: string };
}

/** HR's payroll events (see PayrollService). */
interface PayrollPostedMetadata {
  number: string;
  month: string;
  date: string;
  currency: string;
  expenseMinorUnits: string;
  loanMinorUnits: string;
  netMinorUnits: string;
}

interface PayrollPaidMetadata {
  number: string;
  runNumber: string;
  date: string;
  treasuryId: string;
  amount: { amountMinorUnits: string; currency: string };
}

/**
 * Accounting side of HR (only while Accounting is enabled). A loan is the company's money with the
 * employee, an asset:
 *   paid out (hr.loan.disbursed)   Dr employee advances (117) / Cr the treasury's account
 *   paid back (hr.loan.repaid)     Dr the treasury's account  / Cr employee advances
 *   payroll posted (hr.payroll.posted)  Dr salaries expense (net + installments)
 *                                        Cr employee advances (installments) / Cr salaries payable (net)
 *   salaries paid (hr.payroll.paid)      Dr salaries payable / Cr the treasury's account
 */
@Injectable()
export class AccountingHrPostingListener {
  private readonly logger = new Logger(AccountingHrPostingListener.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    private readonly ledgerAmounts: LedgerAmountService,
  ) {}

  @OnOutboxEvent('hr.loan.disbursed', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleDisbursed(payload: DomainEventPayload): Promise<void> {
    await this.post(payload, 'out');
  }

  @OnOutboxEvent('hr.loan.repaid', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleRepaid(payload: DomainEventPayload): Promise<void> {
    await this.post(payload, 'in');
  }

  @OnOutboxEvent('hr.payroll.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handlePayrollPosted(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as PayrollPostedMetadata | undefined;
    if (!m?.expenseMinorUnits) {
      this.logger.warn(`Payroll event "${payload.entityId}" has no amounts — ignoring.`);
      return;
    }
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const ledger = async (minor: string) => (await this.ledgerAmounts.toLedger(db, { amountMinorUnits: minor, currency: m.currency }, m.date)).amountMinorUnits;
    const loan = await ledger(m.loanMinorUnits);
    const net = await ledger(m.netMinorUnits);
    const expense = (BigInt(loan) + BigInt(net)).toString();
    if (expense === '0') return;
    const lines = [
      { accountId: requiredAccount(settings.salariesExpenseAccountId, 'حساب الرواتب والأجور'), debitAmountMinorUnits: expense, creditAmountMinorUnits: '0' },
      ...(loan !== '0'
        ? [{ accountId: requiredAccount(settings.employeeAdvancesAccountId, 'حساب عهد وسلف الموظفين'), debitAmountMinorUnits: '0', creditAmountMinorUnits: loan }]
        : []),
      ...(net !== '0'
        ? [{ accountId: requiredAccount(settings.salariesPayableAccountId, 'حساب الرواتب المستحقة'), debitAmountMinorUnits: '0', creditAmountMinorUnits: net }]
        : []),
    ];
    await this.journalEntries.createAuto(db, {
      entryDate: m.date,
      description: `مسير رواتب ${m.month} — ${m.number}`,
      lines,
      sourceReferenceType: 'hr_payroll',
      sourceReferenceId: payload.entityId,
    });
  }

  @OnOutboxEvent('hr.payroll.paid', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handlePayrollPaid(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as PayrollPaidMetadata | undefined;
    if (!m?.amount) return;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const payable = requiredAccount(settings.salariesPayableAccountId, 'حساب الرواتب المستحقة');
    const treasury = await resolveTreasuryAccount(db, settings, { treasuryId: m.treasuryId });
    const amount = (await this.ledgerAmounts.toLedger(db, m.amount, m.date)).amountMinorUnits;
    await this.journalEntries.createAuto(db, {
      entryDate: m.date,
      description: `صرف مرتبات ${m.runNumber} — ${m.number}`,
      lines: [
        { accountId: payable, debitAmountMinorUnits: amount, creditAmountMinorUnits: '0' },
        { accountId: treasury, debitAmountMinorUnits: '0', creditAmountMinorUnits: amount },
      ],
      sourceReferenceType: 'hr_payroll_payment',
      sourceReferenceId: payload.entityId,
    });
  }

  private async post(payload: DomainEventPayload, direction: 'out' | 'in'): Promise<void> {
    const m = payload.metadata as unknown as LoanMoneyMetadata | undefined;
    if (!m?.amount) {
      this.logger.warn(`HR loan event "${payload.entityId}" has no amount — ignoring.`);
      return;
    }
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const advances = requiredAccount(settings.employeeAdvancesAccountId, 'حساب عهد وسلف الموظفين');
    const treasury = await resolveTreasuryAccount(db, settings, { treasuryId: m.treasuryId });
    const amount = (await this.ledgerAmounts.toLedger(db, m.amount, m.date)).amountMinorUnits;
    const [debit, credit] = direction === 'out' ? [advances, treasury] : [treasury, advances];
    await this.journalEntries.createAuto(db, {
      entryDate: m.date,
      description: `${direction === 'out' ? 'صرف سلفة' : 'سداد سلفة'} ${m.loanNumber} — ${m.employeeName}`,
      lines: [
        { accountId: debit, debitAmountMinorUnits: amount, creditAmountMinorUnits: '0' },
        { accountId: credit, debitAmountMinorUnits: '0', creditAmountMinorUnits: amount },
      ],
      sourceReferenceType: direction === 'out' ? 'hr_loan' : 'hr_loan_repayment',
      sourceReferenceId: payload.entityId,
    });
  }
}
