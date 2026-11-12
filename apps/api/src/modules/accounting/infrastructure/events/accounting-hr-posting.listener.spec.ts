import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { JournalEntriesService } from '../../application/services/journal-entries.service';
import type { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import type { LedgerAmountService } from '../../application/services/ledger-amount.service';
import { AccountingHrPostingListener } from './accounting-hr-posting.listener';

/** A treasury with its own chart account 'box-account'. */
const db = {
  selectFrom: () => {
    const chain = { select: () => chain, where: () => chain, executeTakeFirst: async () => ({ chart_of_account_id: 'box-account', kind: 'cash' }) };
    return chain;
  },
} as unknown as Kysely<TenantDatabase>;

function payload(eventType: 'disbursed' | 'repaid'): DomainEventPayload {
  return {
    schema: 's',
    entityType: eventType === 'disbursed' ? 'loan' : 'loan_repayment',
    entityId: 'doc-1',
    action: eventType,
    actorUserId: null,
    occurredAt: new Date('2026-02-01T10:00:00Z'),
    metadata: {
      number: 'LR-00001',
      loanNumber: 'LN-00001',
      date: '2026-02-01',
      treasuryId: 'box',
      employeeName: 'أحمد',
      amount: { amountMinorUnits: '150000', currency: 'EGP' },
    },
  };
}

describe('AccountingHrPostingListener', () => {
  const createAuto = jest.fn().mockResolvedValue({});
  function listener(advances: string | null) {
    return new AccountingHrPostingListener(
      { getClient: () => db } as unknown as TenantConnectionManager,
      { createAuto } as unknown as JournalEntriesService,
      { get: async () => ({ employeeAdvancesAccountId: advances, cashAccountId: 'cash' }) } as unknown as AccountingSettingsService,
      { toLedger: async (_db: unknown, a: { amountMinorUnits: string }) => ({ amountMinorUnits: a.amountMinorUnits }) } as unknown as LedgerAmountService,
    );
  }
  beforeEach(() => createAuto.mockClear());

  it('books a pay-out as an asset: Dr employee advances / Cr the treasury', async () => {
    await listener('advances').handleDisbursed(payload('disbursed'));
    const entry = createAuto.mock.calls[0][1];
    expect(entry.lines).toEqual([
      { accountId: 'advances', debitAmountMinorUnits: '150000', creditAmountMinorUnits: '0' },
      { accountId: 'box-account', debitAmountMinorUnits: '0', creditAmountMinorUnits: '150000' },
    ]);
    expect(entry).toMatchObject({ entryDate: '2026-02-01', sourceReferenceType: 'hr_loan', sourceReferenceId: 'doc-1' });
  });

  it('books cash paid back the other way round', async () => {
    await listener('advances').handleRepaid(payload('repaid'));
    expect(createAuto.mock.calls[0][1].lines.map((l: { accountId: string }) => l.accountId)).toEqual(['box-account', 'advances']);
    expect(createAuto.mock.calls[0][1].sourceReferenceType).toBe('hr_loan_repayment');
  });

  it('reports a missing account mapping (the outbox retries it)', async () => {
    await expect(listener(null).handleDisbursed(payload('disbursed'))).rejects.toMatchObject({ code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING' });
  });

  it('books a payroll: Dr expense = net + installments / Cr advances / Cr salaries payable', async () => {
    const l = new AccountingHrPostingListener(
      { getClient: () => db } as unknown as TenantConnectionManager,
      { createAuto } as unknown as JournalEntriesService,
      {
        get: async () => ({ employeeAdvancesAccountId: 'advances', salariesExpenseAccountId: 'expense', salariesPayableAccountId: 'payable' }),
      } as unknown as AccountingSettingsService,
      { toLedger: async (_db: unknown, a: { amountMinorUnits: string }) => ({ amountMinorUnits: a.amountMinorUnits }) } as unknown as LedgerAmountService,
    );
    await l.handlePayrollPosted({
      ...payload('disbursed'),
      entityId: 'run-1',
      metadata: { number: 'PR-00001', month: '2026-03', date: '2026-03-31', currency: 'EGP', expenseMinorUnits: '1100000', loanMinorUnits: '100000', netMinorUnits: '1000000' },
    });
    const entry = createAuto.mock.calls[0][1];
    expect(entry.lines).toEqual([
      { accountId: 'expense', debitAmountMinorUnits: '1100000', creditAmountMinorUnits: '0' },
      { accountId: 'advances', debitAmountMinorUnits: '0', creditAmountMinorUnits: '100000' },
      { accountId: 'payable', debitAmountMinorUnits: '0', creditAmountMinorUnits: '1000000' },
    ]);
    expect(entry).toMatchObject({ entryDate: '2026-03-31', sourceReferenceType: 'hr_payroll' });

    createAuto.mockClear();
    await l.handlePayrollPaid({
      ...payload('disbursed'),
      entityId: 'pay-1',
      metadata: { number: 'PP-00001', runNumber: 'PR-00001', date: '2026-04-01', treasuryId: 'box', amount: { amountMinorUnits: '1000000', currency: 'EGP' } },
    });
    expect(createAuto.mock.calls[0][1].lines.map((x: { accountId: string }) => x.accountId)).toEqual(['payable', 'box-account']);
  });
});
