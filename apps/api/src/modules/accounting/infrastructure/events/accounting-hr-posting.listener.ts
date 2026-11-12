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

/**
 * Accounting side of HR (only while Accounting is enabled). A loan is the company's money with the
 * employee, an asset:
 *   paid out (hr.loan.disbursed)   Dr employee advances (117) / Cr the treasury's account
 *   paid back (hr.loan.repaid)     Dr the treasury's account  / Cr employee advances
 * Installments deducted from salaries are booked by the payroll entry.
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
