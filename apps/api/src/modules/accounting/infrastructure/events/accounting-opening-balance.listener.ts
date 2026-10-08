import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { LedgerAmountService } from '../../application/services/ledger-amount.service';
import { BusinessRuleError } from '../../application/errors';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';

/** shared/statements/party-statements.ts setOpeningBalance()'s outbox metadata. */
export interface OpeningBalanceSetMetadata {
  changeId: string;
  partyName?: string;
  date: string;
  /** Signed in the party's own sense (+ = customer owes us / we owe the supplier). */
  previous: { amountMinorUnits: string; currency: string };
  next: { amountMinorUnits: string; currency: string };
}

/**
 * Customer / supplier opening balances (رصيد أول المدة) set from Sales or
 * Purchases. Posts the CHANGE against the opening-balance equity account,
 * so editing an opening balance later only adds the difference:
 *   customer +: Dr Accounts Receivable / Cr Opening Balance Equity
 *   supplier +: Dr Opening Balance Equity / Cr Accounts Payable
 * (and the reverse for a decrease). Skipped entirely with Accounting off.
 */
@Injectable()
export class AccountingOpeningBalanceListener {
  private readonly logger = new Logger(AccountingOpeningBalanceListener.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    private readonly ledgerAmounts: LedgerAmountService,
  ) {}

  @OnOutboxEvent('sales.customer.opening_balance_set', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handleCustomer(payload: DomainEventPayload): Promise<void> {
    return this.post(payload, 'customer');
  }

  @OnOutboxEvent('purchases.supplier.opening_balance_set', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handleSupplier(payload: DomainEventPayload): Promise<void> {
    return this.post(payload, 'supplier');
  }

  private async post(payload: DomainEventPayload, party: 'customer' | 'supplier'): Promise<void> {
    const metadata = payload.metadata as unknown as OpeningBalanceSetMetadata | undefined;
    if (!metadata?.next || !metadata.previous || !metadata.changeId) {
      this.logger.warn(`Opening balance event for ${party} "${payload.entityId}" has no amounts — ignoring.`);
      return;
    }
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const partyAccount = required(
      party === 'customer' ? settings.accountsReceivableAccountId : settings.accountsPayableAccountId,
      party === 'customer' ? 'حساب العملاء' : 'حساب الموردين',
    );
    const equity = required(settings.openingBalanceEquityAccountId, 'حساب الأرصدة الافتتاحية');

    // The change in the party's sense, in the ledger currency: reverse the old balance, add the new one.
    const toLedgerSigned = async (amount: { amountMinorUnits: string; currency: string }): Promise<bigint> => {
      const value = BigInt(amount.amountMinorUnits);
      if (value === 0n) return 0n;
      const abs = value < 0n ? -value : value;
      const ledger = await this.ledgerAmounts.toLedger(db, { amountMinorUnits: abs.toString(), currency: amount.currency }, metadata.date);
      return value < 0n ? -BigInt(ledger.amountMinorUnits) : BigInt(ledger.amountMinorUnits);
    };
    const delta = (await toLedgerSigned(metadata.next)) - (await toLedgerSigned(metadata.previous));
    if (delta === 0n) return;

    const abs = (delta < 0n ? -delta : delta).toString();
    // Customer: + raises the receivable (debit). Supplier: + raises the payable (credit).
    const partyIsDebit = party === 'customer' ? delta > 0n : delta < 0n;
    const lines: CreateJournalEntryLineInput[] = partyIsDebit
      ? [
          { accountId: partyAccount, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
          { accountId: equity, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
        ]
      : [
          { accountId: equity, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
          { accountId: partyAccount, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
        ];

    const who = party === 'customer' ? 'عميل' : 'مورد';
    await this.journalEntries.createAuto(db, {
      entryDate: metadata.date,
      description: `رصيد أول المدة — ${who}${metadata.partyName ? ` ${metadata.partyName}` : ''}`,
      lines,
      sourceReferenceType: `${party}_opening_balance`,
      sourceReferenceId: metadata.changeId,
    });
  }
}

function required(accountId: string | null, label: string): string {
  if (!accountId) {
    throw new BusinessRuleError(`Account mapping "${label}" is not configured.`, {
      code: 'ACCOUNTING_SETTINGS.MAPPING_MISSING',
      params: { account: label },
    });
  }
  return accountId;
}
