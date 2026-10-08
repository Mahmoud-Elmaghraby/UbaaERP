import { Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { JournalEntriesService } from '../../application/services/journal-entries.service';
import { AccountingSettingsService } from '../../application/services/accounting-settings.service';
import { LedgerAmountService } from '../../application/services/ledger-amount.service';
import { requiredAccount, resolveTreasuryAccount } from '../../application/services/treasury-account-resolver';
import type { CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';

/** Treasury module's voucher events (see TreasuryVouchersService). */
interface VoucherMetadata {
  kind: 'expense' | 'income' | 'transfer';
  voucherNumber: string;
  voucherDate: string;
  treasuryId: string;
  toTreasuryId: string | null;
  categoryName: string | null;
  categoryAccountId: string | null;
  amount: { amountMinorUnits: string; currency: string };
  description: string | null;
}

interface TreasuryOpeningMetadata {
  changeId: string;
  treasuryName?: string;
  date: string;
  previous: { amountMinorUnits: string; currency: string };
  next: { amountMinorUnits: string; currency: string };
}

const TITLES = { expense: 'مصروف', income: 'إيراد', transfer: 'تحويل بين الخزائن' } as const;

/**
 * Accounting side of the Treasury module (only while Accounting is enabled):
 *   expense   Dr item's account        / Cr treasury's account
 *   income    Dr treasury's account    / Cr item's account
 *   transfer  Dr destination treasury  / Cr source treasury
 *   cancelled → the exact reverse, as its own entry
 *   opening balance change → Dr/Cr treasury vs opening-balance equity (the difference)
 * A treasury's account is its linked chart account, else the cash / default
 * bank mapping (resolveTreasuryAccount).
 */
@Injectable()
export class AccountingTreasuryPostingListener {
  private readonly logger = new Logger(AccountingTreasuryPostingListener.name);

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    private readonly ledgerAmounts: LedgerAmountService,
  ) {}

  @OnOutboxEvent('treasury.voucher.posted', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handlePosted(payload: DomainEventPayload): Promise<void> {
    return this.postVoucher(payload, false);
  }

  @OnOutboxEvent('treasury.voucher.cancelled', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  handleCancelled(payload: DomainEventPayload): Promise<void> {
    return this.postVoucher(payload, true);
  }

  @OnOutboxEvent('treasury.treasury.opening_balance_set', { requiresFeature: FEATURE_KEYS.ACCOUNTING })
  async handleOpeningBalance(payload: DomainEventPayload): Promise<void> {
    const m = payload.metadata as unknown as TreasuryOpeningMetadata | undefined;
    if (!m?.changeId) return;
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const treasuryAccount = await resolveTreasuryAccount(db, settings, { treasuryId: payload.entityId });
    const equity = requiredAccount(settings.openingBalanceEquityAccountId, 'حساب الأرصدة الافتتاحية');
    const delta = (await this.toLedger(db, m.next, m.date)) - (await this.toLedger(db, m.previous, m.date));
    if (delta === 0n) return;
    const abs = (delta < 0n ? -delta : delta).toString();
    const lines: CreateJournalEntryLineInput[] =
      delta > 0n
        ? [debit(treasuryAccount, abs), credit(equity, abs)]
        : [debit(equity, abs), credit(treasuryAccount, abs)];
    await this.journalEntries.createAuto(db, {
      entryDate: m.date,
      description: `رصيد أول المدة — خزينة${m.treasuryName ? ` ${m.treasuryName}` : ''}`,
      lines,
      sourceReferenceType: 'treasury_opening_balance',
      sourceReferenceId: m.changeId,
    });
  }

  private async postVoucher(payload: DomainEventPayload, reverse: boolean): Promise<void> {
    const m = payload.metadata as unknown as VoucherMetadata | undefined;
    if (!m?.amount) {
      this.logger.warn(`Treasury voucher event "${payload.entityId}" has no amount — ignoring.`);
      return;
    }
    const db = this.connections.getClient(payload.schema);
    const settings = await this.accountingSettings.get(db);
    const amount = (await this.toLedger(db, m.amount, m.voucherDate)).toString();
    const from = await resolveTreasuryAccount(db, settings, { treasuryId: m.treasuryId });

    let debitAccount: string;
    let creditAccount: string;
    if (m.kind === 'transfer') {
      debitAccount = await resolveTreasuryAccount(db, settings, { treasuryId: m.toTreasuryId });
      creditAccount = from;
      if (debitAccount === creditAccount) return; // both treasuries fall back to the same account — nothing moves in the ledger
    } else {
      const item = requiredAccount(m.categoryAccountId, `حساب البند "${m.categoryName ?? ''}"`);
      [debitAccount, creditAccount] = m.kind === 'expense' ? [item, from] : [from, item];
    }
    if (reverse) [debitAccount, creditAccount] = [creditAccount, debitAccount];

    const title = `${reverse ? 'إلغاء ' : ''}${TITLES[m.kind]} — ${m.voucherNumber}`;
    await this.journalEntries.createAuto(db, {
      entryDate: m.voucherDate,
      description: [title, m.categoryName, m.description].filter(Boolean).join(' — '),
      lines: [debit(debitAccount, amount), credit(creditAccount, amount)],
      sourceReferenceType: reverse ? 'treasury_voucher_cancellation' : 'treasury_voucher',
      sourceReferenceId: payload.entityId,
    });
  }

  private async toLedger(db: Kysely<TenantDatabase>, amount: { amountMinorUnits: string; currency: string }, date: string): Promise<bigint> {
    const value = BigInt(amount.amountMinorUnits);
    if (value === 0n) return 0n;
    const abs = value < 0n ? -value : value;
    const ledger = await this.ledgerAmounts.toLedger(db, { amountMinorUnits: abs.toString(), currency: amount.currency }, date);
    return value < 0n ? -BigInt(ledger.amountMinorUnits) : BigInt(ledger.amountMinorUnits);
  }
}

function debit(accountId: string, amount: string): CreateJournalEntryLineInput {
  return { accountId, debitAmountMinorUnits: amount, creditAmountMinorUnits: '0' };
}

function credit(accountId: string, amount: string): CreateJournalEntryLineInput {
  return { accountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: amount };
}
