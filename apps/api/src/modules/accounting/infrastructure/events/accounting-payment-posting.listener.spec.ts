import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { JournalEntriesService } from '../../application/services/journal-entries.service';
import type { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import type { LedgerAmountService } from '../../application/services/ledger-amount.service';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import { AccountingPaymentPostingListener } from './accounting-payment-posting.listener';

function fakeDb(bankChartAccount: string | null): Kysely<TenantDatabase> {
  const chain = {
    select: () => chain,
    where: () => chain,
    executeTakeFirst: async () => (bankChartAccount ? { chart_of_account_id: bankChartAccount } : undefined),
  };
  return { selectFrom: () => chain } as unknown as Kysely<TenantDatabase>;
}

const SETTINGS = {
  accountsReceivableAccountId: 'ar',
  cashAccountId: 'cash',
  defaultBankAccountId: 'bank-default',
} as AccountingSettings;

function payload(metadata: Record<string, unknown>): DomainEventPayload {
  return {
    schema: 's',
    entityType: 'payment_received',
    entityId: 'pay-1',
    action: 'posted',
    actorUserId: null,
    metadata: { amount: { amountMinorUnits: '15000', currency: 'EGP' }, paymentNumber: 'RCV-00001', ...metadata },
    occurredAt: new Date('2026-10-08T10:00:00Z'),
  };
}

describe('AccountingPaymentPostingListener', () => {
  let createAuto: jest.Mock;
  let toLedger: jest.Mock;

  function listener(bankChartAccount: string | null = null, settings: Partial<AccountingSettings> = {}) {
    createAuto = jest.fn().mockResolvedValue({});
    toLedger = jest.fn(async (_db, amount) => ({ amountMinorUnits: amount.amountMinorUnits, tenantCurrency: 'EGP', wasConverted: false }));
    return new AccountingPaymentPostingListener(
      { getClient: () => fakeDb(bankChartAccount) } as unknown as TenantConnectionManager,
      { createAuto } as unknown as JournalEntriesService,
      { get: jest.fn().mockResolvedValue({ ...SETTINGS, ...settings }) } as unknown as AccountingSettingsService,
      { toLedger } as unknown as LedgerAmountService,
    );
  }

  const debitAccount = () => createAuto.mock.calls[0][1].lines[0].accountId;

  it('a cash receipt: Dr cash / Cr receivables, dated on the payment date', async () => {
    await listener().handlePaymentReceived(payload({ paymentMethod: 'cash', paymentDate: '2026-10-01' }));
    const entry = createAuto.mock.calls[0][1];
    expect(entry.entryDate).toBe('2026-10-01');
    expect(entry.lines).toEqual([
      { accountId: 'cash', debitAmountMinorUnits: '15000', creditAmountMinorUnits: '0' },
      { accountId: 'ar', debitAmountMinorUnits: '0', creditAmountMinorUnits: '15000' },
    ]);
    expect(entry.sourceReferenceType).toBe('payment_received');
  });

  it('a deposit to a chosen bank account debits that bank account’s ledger account', async () => {
    await listener('bank-cib').handlePaymentReceived(payload({ paymentMethod: 'bank_transfer', bankAccountId: 'b1' }));
    expect(debitAccount()).toBe('bank-cib');
  });

  it('a card / cheque receipt without a bank account goes to the default bank account', async () => {
    await listener().handlePaymentReceived(payload({ paymentMethod: 'card' }));
    expect(debitAccount()).toBe('bank-default');
  });

  it('posts the amount converted to the ledger currency', async () => {
    const l = listener();
    toLedger.mockResolvedValueOnce({ amountMinorUnits: '75000', tenantCurrency: 'EGP', wasConverted: true });
    await l.handlePaymentReceived(payload({ paymentMethod: 'cash', amount: { amountMinorUnits: '1500', currency: 'USD' } }));
    expect(createAuto.mock.calls[0][1].lines[1].creditAmountMinorUnits).toBe('75000');
  });

  it('fails loudly (outbox retries) when receivables are not mapped', async () => {
    await expect(
      listener(null, { accountsReceivableAccountId: null }).handlePaymentReceived(payload({ paymentMethod: 'cash' })),
    ).rejects.toMatchObject({ code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING' });
  });
});
