import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { InventoryValuationPostedMetadata } from '../../../../shared/events/inventory-valuation-event';
import type { JournalEntriesService } from '../../application/services/journal-entries.service';
import type { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import { BusinessRuleError } from '../../application/errors';
import { AccountingInventoryPostingListener } from './accounting-inventory-posting.listener';

const ACCOUNT_IDS = [
  'inv',
  'cogs',
  'grni',
  'adj',
  'opening',
  'expense',
  'damage-expense',
] as const;

/** Minimal Kysely stand-in: the listener only reads chart_of_accounts to check accounts are postable. */
function fakeDb(inactive: string[] = []): Kysely<TenantDatabase> {
  const chain = {
    select: () => chain,
    where: () => chain,
    execute: async () =>
      ACCOUNT_IDS.map((id) => ({ id, name: id, is_active: !inactive.includes(id), is_group: false })),
  };
  return { selectFrom: () => chain } as unknown as Kysely<TenantDatabase>;
}

function settings(overrides: Partial<AccountingSettings> = {}): AccountingSettings {
  return {
    id: 's',
    accountsReceivableAccountId: 'ar',
    inventoryAccountId: 'inv',
    cogsAccountId: 'cogs',
    salesReturnsContraAccountId: 'contra',
    revenueAccountId: 'rev',
    accountsPayableAccountId: 'ap',
    purchaseExpenseAccountId: 'expense',
    cashAccountId: 'cash',
    cashOverShortAccountId: null,
    exchangeGainLossAccountId: null,
    grniAccountId: 'grni',
    inventoryAdjustmentAccountId: 'adj',
    openingBalanceEquityAccountId: 'opening',
    landedCostClearingAccountId: null,
    defaultBankAccountId: null,
    vatOutputAccountId: null,
    vatInputAccountId: null,
    tableTaxOutputAccountId: null,
    tableTaxInputAccountId: null,
    withholdingPayableAccountId: null,
    withholdingReceivableAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function payload(metadata: InventoryValuationPostedMetadata): DomainEventPayload {
  return {
    schema: 'tenant_x',
    entityType: metadata.sourceType,
    entityId: metadata.sourceId,
    action: 'valuation_posted',
    actorUserId: null,
    metadata: metadata as unknown as Record<string, unknown>,
    occurredAt: new Date('2026-10-08T10:00:00Z'),
  };
}

const egp = (minor: string) => ({ amountMinorUnits: minor, currency: 'EGP' });

describe('AccountingInventoryPostingListener', () => {
  let journalEntries: jest.Mocked<JournalEntriesService>;
  let accountingSettings: jest.Mocked<AccountingSettingsService>;
  let listener: AccountingInventoryPostingListener;
  let db: Kysely<TenantDatabase>;

  beforeEach(() => {
    db = fakeDb();
    journalEntries = { createAuto: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<JournalEntriesService>;
    accountingSettings = { get: jest.fn().mockResolvedValue(settings()) } as unknown as jest.Mocked<AccountingSettingsService>;
    const connections = { getClient: jest.fn(() => db) } as unknown as TenantConnectionManager;
    listener = new AccountingInventoryPostingListener(connections, journalEntries, accountingSettings);
  });

  it('posts a goods receipt as Dr Inventory / Cr GRNI, keyed by the document', async () => {
    await listener.handle(
      payload({
        sourceType: 'goods_receipt',
        sourceId: 'gr-1',
        documentNumber: 'GR-00001',
        entryDate: '2026-10-08',
        description: null,
        entries: [{ kind: 'receipt', amount: egp('100000'), counterAccountId: null }],
      }),
    );
    expect(journalEntries.createAuto).toHaveBeenCalledWith(db, {
      entryDate: '2026-10-08',
      description: 'قيد مخزون — GR-00001',
      lines: [
        { accountId: 'inv', debitAmountMinorUnits: '100000', creditAmountMinorUnits: '0' },
        { accountId: 'grni', debitAmountMinorUnits: '0', creditAmountMinorUnits: '100000' },
      ],
      sourceReferenceType: 'inventory_goods_receipt',
      sourceReferenceId: 'gr-1',
    });
  });

  it('nets a stocktake with gains and losses into one compact entry', async () => {
    await listener.handle(
      payload({
        sourceType: 'stock_count',
        sourceId: 'cnt-1',
        documentNumber: 'CNT-00001',
        entryDate: '2026-10-08',
        description: 'فروق جرد',
        entries: [
          { kind: 'adjustment_gain', amount: egp('3000'), counterAccountId: null },
          { kind: 'adjustment_loss', amount: egp('5000'), counterAccountId: null },
        ],
      }),
    );
    const lines = journalEntries.createAuto.mock.calls[0]![1].lines;
    expect(lines).toEqual([
      { accountId: 'adj', debitAmountMinorUnits: '2000', creditAmountMinorUnits: '0' },
      { accountId: 'inv', debitAmountMinorUnits: '0', creditAmountMinorUnits: '2000' },
    ]);
  });

  it("uses a reason's own account for a loss, and the default for the rest", async () => {
    await listener.handle(
      payload({
        sourceType: 'stock_adjustment',
        sourceId: 'adj-1',
        documentNumber: 'ADJ-00001',
        entryDate: '2026-10-08',
        description: null,
        entries: [
          { kind: 'adjustment_loss', amount: egp('700'), counterAccountId: 'damage-expense' },
          { kind: 'adjustment_loss', amount: egp('300'), counterAccountId: null },
        ],
      }),
    );
    expect(journalEntries.createAuto.mock.calls[0]![1].lines).toEqual([
      { accountId: 'damage-expense', debitAmountMinorUnits: '700', creditAmountMinorUnits: '0' },
      { accountId: 'adj', debitAmountMinorUnits: '300', creditAmountMinorUnits: '0' },
      { accountId: 'inv', debitAmountMinorUnits: '0', creditAmountMinorUnits: '1000' },
    ]);
  });

  it('posts opening balances against equity and landed costs against purchase expense by default', async () => {
    await listener.handle(
      payload({
        sourceType: 'landed_cost',
        sourceId: 'lc-1',
        documentNumber: null,
        entryDate: '2026-10-08',
        description: 'مصاريف شراء إضافية',
        entries: [
          { kind: 'landed_cost_inventory', amount: egp('800'), counterAccountId: null },
          { kind: 'landed_cost_cogs', amount: egp('200'), counterAccountId: null },
        ],
      }),
    );
    expect(journalEntries.createAuto.mock.calls[0]![1].lines).toEqual([
      { accountId: 'inv', debitAmountMinorUnits: '800', creditAmountMinorUnits: '0' },
      { accountId: 'cogs', debitAmountMinorUnits: '200', creditAmountMinorUnits: '0' },
      { accountId: 'expense', debitAmountMinorUnits: '0', creditAmountMinorUnits: '1000' },
    ]);

    await listener.handle(
      payload({
        sourceType: 'opening_balance',
        sourceId: 'opn-1',
        documentNumber: 'OPN-00001',
        entryDate: '2026-01-01',
        description: null,
        entries: [{ kind: 'opening', amount: egp('5000'), counterAccountId: null }],
      }),
    );
    expect(journalEntries.createAuto.mock.calls[1]![1].lines).toEqual([
      { accountId: 'inv', debitAmountMinorUnits: '5000', creditAmountMinorUnits: '0' },
      { accountId: 'opening', debitAmountMinorUnits: '0', creditAmountMinorUnits: '5000' },
    ]);
  });

  it('fails loudly (outbox retries) when a mapping is missing or the account cannot take postings', async () => {
    accountingSettings.get.mockResolvedValue(settings({ grniAccountId: null }));
    const receipt = payload({
      sourceType: 'goods_receipt',
      sourceId: 'gr-2',
      documentNumber: null,
      entryDate: '2026-10-08',
      description: null,
      entries: [{ kind: 'receipt', amount: egp('1'), counterAccountId: null }],
    });
    await expect(listener.handle(receipt)).rejects.toMatchObject({
      code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
    });

    accountingSettings.get.mockResolvedValue(settings());
    db = fakeDb(['grni']);
    await expect(listener.handle(receipt)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(journalEntries.createAuto).not.toHaveBeenCalled();
  });
});
