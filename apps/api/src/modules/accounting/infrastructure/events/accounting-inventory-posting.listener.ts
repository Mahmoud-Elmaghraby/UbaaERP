import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import {
  INVENTORY_VALUATION_POSTED,
  type InventoryValuationKind,
  type InventoryValuationPostedMetadata,
} from '../../../../shared/events/inventory-valuation-event';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { BusinessRuleError } from '../../application/errors';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';

type SettingKey = keyof Pick<
  AccountingSettings,
  | 'inventoryAccountId'
  | 'cogsAccountId'
  | 'grniAccountId'
  | 'inventoryAdjustmentAccountId'
  | 'openingBalanceEquityAccountId'
  | 'landedCostClearingAccountId'
  | 'purchaseExpenseAccountId'
>;

const SETTING_LABELS: Record<SettingKey, string> = {
  inventoryAccountId: 'حساب المخزون',
  cogsAccountId: 'حساب تكلفة البضاعة المباعة',
  grniAccountId: 'حساب بضاعة مستلمة لم تصل فواتيرها',
  inventoryAdjustmentAccountId: 'حساب تسويات وفروق المخزون',
  openingBalanceEquityAccountId: 'حساب الأرصدة الافتتاحية',
  landedCostClearingAccountId: 'حساب المصاريف الإضافية على المشتريات',
  purchaseExpenseAccountId: 'حساب مصروفات المشتريات',
};

/**
 * Accounting side of 'inventory.valuation.posted' (see that event file):
 * one journal entry per inventory document, built from the kinds Inventory
 * reported. The debit/credit account of each kind is decided HERE, from
 * accounting_settings (migration 0084 added the four inventory mappings):
 *
 *   receipt                Dr Inventory          / Cr GRNI
 *   purchase_return        Dr GRNI               / Cr Inventory
 *   adjustment_gain        Dr Inventory          / Cr reason account | adjustment account
 *   adjustment_loss        Dr reason | adjustment / Cr Inventory
 *   opening                Dr Inventory          / Cr Opening balances
 *   landed_cost_inventory  Dr Inventory          / Cr landed-cost clearing | purchase expense
 *   landed_cost_cogs       Dr COGS               / Cr landed-cost clearing | purchase expense
 *
 * Lines on the same account are netted, so a stocktake with gains and
 * losses posts one compact entry. Errors propagate (outbox retries, then
 * the failed row is visible in Settings › Background operations) — a
 * missing mapping says which one in Arabic.
 */
@Injectable()
export class AccountingInventoryPostingListener {
  private readonly logger = new Logger(AccountingInventoryPostingListener.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
  ) {}

  @OnOutboxEvent(INVENTORY_VALUATION_POSTED, { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as InventoryValuationPostedMetadata | undefined;
    if (!metadata?.entries?.length) {
      this.logger.warn(`Received '${INVENTORY_VALUATION_POSTED}' with no entries — ignoring.`);
      return;
    }
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const lines = await this.buildLines(db, settings, metadata);
    if (lines.length === 0) return;

    await this.journalEntries.createAuto(db, {
      entryDate: metadata.entryDate,
      description: metadata.description ?? `قيد مخزون — ${metadata.documentNumber ?? metadata.sourceId}`,
      lines,
      sourceReferenceType: `inventory_${metadata.sourceType}`,
      sourceReferenceId: metadata.sourceId,
    });
  }

  private async buildLines(
    db: Kysely<TenantDatabase>,
    settings: AccountingSettings,
    metadata: InventoryValuationPostedMetadata,
  ): Promise<CreateJournalEntryLineInput[]> {
    // account → signed amount (debit +, credit −), netted.
    const net = new Map<string, bigint>();
    const add = (accountId: string, amount: bigint) => net.set(accountId, (net.get(accountId) ?? 0n) + amount);

    for (const entry of metadata.entries) {
      const amount = BigInt(entry.amount.amountMinorUnits);
      if (amount === 0n) continue;
      const { debit, credit } = this.accountsFor(settings, entry.kind, entry.counterAccountId);
      add(debit, amount);
      add(credit, -amount);
    }
    await this.assertActiveAccounts(db, [...net.keys()]);

    const lines: CreateJournalEntryLineInput[] = [];
    for (const [accountId, amount] of net) {
      if (amount === 0n) continue;
      lines.push(
        amount > 0n
          ? { accountId, debitAmountMinorUnits: amount.toString(), creditAmountMinorUnits: '0' }
          : { accountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: (-amount).toString() },
      );
    }
    // Debits first, the way an accountant reads an entry.
    return lines.sort((a, b) => (a.debitAmountMinorUnits === '0' ? 1 : 0) - (b.debitAmountMinorUnits === '0' ? 1 : 0));
  }

  private accountsFor(
    settings: AccountingSettings,
    kind: InventoryValuationKind,
    counterAccountId: string | null,
  ): { debit: string; credit: string } {
    const inventory = this.required(settings, 'inventoryAccountId');
    switch (kind) {
      case 'receipt':
        return { debit: inventory, credit: this.required(settings, 'grniAccountId') };
      case 'purchase_return':
        return { debit: this.required(settings, 'grniAccountId'), credit: inventory };
      case 'adjustment_gain':
        return { debit: inventory, credit: counterAccountId ?? this.required(settings, 'inventoryAdjustmentAccountId') };
      case 'adjustment_loss':
        return { debit: counterAccountId ?? this.required(settings, 'inventoryAdjustmentAccountId'), credit: inventory };
      case 'opening':
        return { debit: inventory, credit: this.required(settings, 'openingBalanceEquityAccountId') };
      case 'landed_cost_inventory':
        return { debit: inventory, credit: this.landedCostClearing(settings) };
      case 'landed_cost_cogs':
        return { debit: this.required(settings, 'cogsAccountId'), credit: this.landedCostClearing(settings) };
      default: {
        const unknown: never = kind;
        throw new BusinessRuleError(`Unknown inventory valuation kind "${unknown as string}".`);
      }
    }
  }

  private landedCostClearing(settings: AccountingSettings): string {
    return settings.landedCostClearingAccountId ?? this.required(settings, 'purchaseExpenseAccountId');
  }

  private required(settings: AccountingSettings, key: SettingKey): string {
    const accountId = settings[key];
    if (!accountId) {
      throw new BusinessRuleError(`accounting_settings.${key} is not configured.`, {
        code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
        params: { account: SETTING_LABELS[key] },
      });
    }
    return accountId;
  }

  /** A reason's own account may have been deactivated or turned into a group since it was chosen. */
  private async assertActiveAccounts(db: Kysely<TenantDatabase>, accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) return;
    const rows = await db
      .selectFrom('chart_of_accounts')
      .select(['id', 'name', 'is_active', 'is_group'])
      .where('id', 'in', accountIds)
      .execute();
    for (const id of accountIds) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || !row.is_active || row.is_group) {
        throw new BusinessRuleError(`Account "${row?.name ?? id}" cannot receive postings.`, {
          code: 'ACCOUNTING_SETTINGS.ACCOUNT_NOT_POSTABLE',
          params: { name: row?.name ?? id },
        });
      }
    }
  }
}
