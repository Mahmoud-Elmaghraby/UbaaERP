import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepository } from '../ports/journal-entry.repository';
import {
  JOURNAL_ENTRY_LINE_REPOSITORY,
  type JournalEntryLineRepository,
} from '../ports/journal-entry-line.repository';
import type {
  JournalEntry,
  JournalEntryWithLines,
  JournalEntryFilters,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntryLineToPersist,
  CreateAutoJournalEntryInput,
} from '../../domain/journal-entry.entity';
import { BusinessRuleError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { AccountingPeriodsService } from './accounting-periods.service';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';

/**
 * Journal Entries (CLAUDE.md §10 — step 5, Accounting, Stage 2). Manual
 * entries only — no @OnEvent listeners yet (Stage 3, not built).
 *
 * Two-step by design, like every other document in this codebase:
 * create() persists a 'draft' and fully validates it (balance, postable
 * accounts), but has no effect on any account's balance yet. post() is
 * the one-way door that actually makes it count — see post()'s own
 * comment for why it re-validates the period, not just the balance.
 */
@Injectable()
export class JournalEntriesService {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepository,
    @Inject(JOURNAL_ENTRY_LINE_REPOSITORY) private readonly lines: JournalEntryLineRepository,
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly periods: AccountingPeriodsService,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  list(db: Kysely<TenantDatabase>, filters?: JournalEntryFilters): Promise<JournalEntry[]> {
    return this.entries.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntryWithLines> {
    const entry = await this.entries.findById(db, id);
    if (!entry) throw entityNotFound('JOURNAL_ENTRY', id);
    const lines = await this.lines.listByJournalEntryId(db, id);
    return { ...entry, lines };
  }

  /**
   * Converts + validates raw lines from a controller into what the
   * repository will actually persist: exactly one non-zero side per
   * line, every account a postable leaf, and the whole set balancing
   * (total debits === total credits) in the given currency.
   */
  private async buildAndValidateLines(
    db: Kysely<TenantDatabase>,
    currency: string,
    rawLines: CreateJournalEntryLineInput[],
  ): Promise<JournalEntryLineToPersist[]> {
    if (rawLines.length < 2) {
      throw new BusinessRuleError('A journal entry needs at least two lines to balance.', {
        code: 'JOURNAL_ENTRY.AT_LEAST_TWO_LINES_REQUIRED',
      });
    }

    const built: JournalEntryLineToPersist[] = [];
    let totalDebit = Money.zero(currency);
    let totalCredit = Money.zero(currency);

    for (const raw of rawLines) {
      const debit = Money.fromMinorUnits(BigInt(raw.debitAmountMinorUnits), currency);
      const credit = Money.fromMinorUnits(BigInt(raw.creditAmountMinorUnits), currency);
      if (debit.isPositive() === credit.isPositive()) {
        throw new BusinessRuleError(
          'Each journal entry line must have exactly one of a debit or a credit amount — not both, not neither.',
          { code: 'JOURNAL_ENTRY.LINE_MUST_HAVE_ONE_SIDE' },
        );
      }

      await this.chartOfAccounts.assertPostable(db, raw.accountId);

      built.push({
        accountId: raw.accountId,
        debitAmount: debit,
        creditAmount: credit,
        description: raw.description ?? null,
        costCenterId: raw.costCenterId ?? null,
      });
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new BusinessRuleError(
        `This entry does not balance — total debits ${totalDebit.toDecimalString()} ${currency}, ` +
          `total credits ${totalCredit.toDecimalString()} ${currency}.`,
        {
          code: 'JOURNAL_ENTRY.NOT_BALANCED',
          params: { totalDebit: totalDebit.toDecimalString(), totalCredit: totalCredit.toDecimalString(), currency },
        },
      );
    }

    return built;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateJournalEntryInput): Promise<JournalEntryWithLines> {
    const tenantSettings = await this.tenantSettings.get(db);
    const currency = tenantSettings.currencyCode;
    const builtLines = await this.buildAndValidateLines(db, currency, input.lines);

    return db.transaction().execute(async (trx) => {
      const allocated = await this.numberingSequences.allocateNext(trx, 'journal_entry', null);
      const entry = await this.entries.create(trx, {
        entryNumber: allocated.formatted,
        entryDate: input.entryDate,
        currency,
        source: 'manual',
        description: input.description ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });
      const lines = await this.lines.createMany(trx, entry.id, builtLines);
      return { ...entry, lines };
    });
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateJournalEntryInput,
  ): Promise<JournalEntryWithLines> {
    const existing = await this.entries.findById(db, id);
    if (!existing) throw entityNotFound('JOURNAL_ENTRY', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Journal entry "${existing.entryNumber}" is "${existing.status}" and can no longer be edited.`,
        { code: 'JOURNAL_ENTRY.NOT_EDITABLE', params: { entryNumber: existing.entryNumber, status: existing.status } },
      );
    }

    const builtLines = await this.buildAndValidateLines(db, existing.currency, input.lines);

    return db.transaction().execute(async (trx) => {
      const updated = await this.entries.update(trx, id, {
        entryDate: input.entryDate,
        description: input.description ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });
      if (!updated) throw entityNotFound('JOURNAL_ENTRY', id);
      await this.lines.deleteByJournalEntryId(trx, id);
      const lines = await this.lines.createMany(trx, id, builtLines);
      return { ...updated, lines };
    });
  }

  /**
   * The one-way door. Re-validates the balance one more time (defense in
   * depth — cheap given the lines are already loaded) and, unlike
   * create()/update(), requires the entry's own accounting period to be
   * open — a draft can be written for any date, but actually posting is
   * what CLAUDE.md's period-close semantics are meant to block.
   */
  async post(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntryWithLines> {
    const entry = await this.getById(db, id);
    if (entry.status !== 'draft') {
      throw new BusinessRuleError(
        `Journal entry "${entry.entryNumber}" is "${entry.status}" — only a draft can be posted.`,
        { code: 'JOURNAL_ENTRY.NOT_POSTABLE', params: { entryNumber: entry.entryNumber, status: entry.status } },
      );
    }

    let totalDebit = Money.zero(entry.currency);
    let totalCredit = Money.zero(entry.currency);
    for (const line of entry.lines) {
      totalDebit = totalDebit.add(line.debitAmount);
      totalCredit = totalCredit.add(line.creditAmount);
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new BusinessRuleError(`Journal entry "${entry.entryNumber}" does not balance and cannot be posted.`, {
        code: 'JOURNAL_ENTRY.POST_NOT_BALANCED',
        params: { entryNumber: entry.entryNumber },
      });
    }

    await this.periods.assertOpenForDate(db, entry.entryDate);

    const updated = await this.entries.updateStatus(db, id, 'posted', new Date());
    return { ...(updated ?? entry), lines: entry.lines };
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntry> {
    const entry = await this.entries.findById(db, id);
    if (!entry) throw entityNotFound('JOURNAL_ENTRY', id);
    if (entry.status !== 'draft') {
      throw new BusinessRuleError(
        `Journal entry "${entry.entryNumber}" is "${entry.status}" — only a draft can be cancelled. ` +
          'A posted entry is a ledger-worthy fact; reverse it instead.',
        { code: 'JOURNAL_ENTRY.NOT_CANCELLABLE', params: { entryNumber: entry.entryNumber, status: entry.status } },
      );
    }
    const updated = await this.entries.updateStatus(db, id, 'cancelled');
    return updated!;
  }

  /**
   * The real accounting reversal — creates a NEW draft entry with every
   * line's debit/credit swapped, linked back via reversalOfEntryId,
   * rather than voiding or deleting the posted original (preserves the
   * audit trail; see migration 0050's own reasoning). The caller still
   * has to post() the returned entry themselves, same discipline as
   * every other financial document in this codebase.
   */
  async reverse(
    db: Kysely<TenantDatabase>,
    id: string,
    options?: { reversalDate?: string; description?: string | null },
  ): Promise<JournalEntryWithLines> {
    const original = await this.getById(db, id);
    if (original.status !== 'posted') {
      throw new BusinessRuleError(
        `Journal entry "${original.entryNumber}" is "${original.status}" — only a posted entry can be reversed.`,
        {
          code: 'JOURNAL_ENTRY.NOT_REVERSIBLE',
          params: { entryNumber: original.entryNumber, status: original.status },
        },
      );
    }

    const reversalDate = options?.reversalDate ?? new Date().toISOString().slice(0, 10);
    const description = options?.description ?? `Reversal of ${original.entryNumber}`;

    const swappedLines: JournalEntryLineToPersist[] = original.lines.map((line) => ({
      accountId: line.accountId,
      debitAmount: line.creditAmount,
      creditAmount: line.debitAmount,
      description: line.description,
      // Carried through unchanged (Stage 4) — a reversal is reversing this
      // same line's activity, so it belongs to the same cost center, if any.
      costCenterId: line.costCenterId,
    }));

    return db.transaction().execute(async (trx) => {
      const allocated = await this.numberingSequences.allocateNext(trx, 'journal_entry', null);
      const entry = await this.entries.create(trx, {
        entryNumber: allocated.formatted,
        entryDate: reversalDate,
        currency: original.currency,
        source: 'manual',
        description,
        reversalOfEntryId: original.id,
        notes: null,
        customFields: {},
      });
      const lines = await this.lines.createMany(trx, entry.id, swappedLines);
      return { ...entry, lines };
    });
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const entry = await this.entries.findById(db, id);
    if (!entry) throw entityNotFound('JOURNAL_ENTRY', id);
    if (entry.status !== 'draft') {
      throw new BusinessRuleError(`Journal entry "${entry.entryNumber}" is "${entry.status}" and cannot be deleted.`, {
        code: 'JOURNAL_ENTRY.NOT_DELETABLE',
        params: { entryNumber: entry.entryNumber, status: entry.status },
      });
    }
    const deleted = await this.entries.delete(db, id);
    if (!deleted) throw entityNotFound('JOURNAL_ENTRY', id);
  }

  /**
   * Stage 6/7 auto-posting entry point — used only by Accounting's own
   * @OnEvent listeners (never the controller). Idempotent: an
   * @OnEvent listener invoked via the Outbox dispatcher can legitimately
   * fire more than once for the same underlying fact (a retry after a
   * transient failure), so this always checks
   * findBySourceReference() first. Three outcomes if a prior attempt
   * already ran:
   *  - already posted → return it as-is, nothing to do.
   *  - still a draft (post() failed last time, e.g. period not open
   *    yet) → try to post() it now, without creating a second entry.
   *  - anything else (cancelled — should not normally happen for an
   *    auto entry) → surface a clear error rather than silently
   *    inventing new behavior.
   * On genuinely first creation, builds + validates the lines, creates
   * a draft tagged source='auto' with the given source reference, then
   * immediately posts it — CLAUDE.md §9.2's "for review" staging option
   * is not built yet (no tenant setting exists to gate this), so an
   * auto-generated entry always posts immediately for now; see
   * claude/accounting-module-status.md.
   *
   * Errors are deliberately left to propagate (no try/catch here) —
   * the caller is an @OnEvent handler reacting to an Outbox-dispatched
   * event, and letting the throw surface is what makes
   * OutboxDispatcherService retry it instead of silently losing it.
   */
  async createAuto(db: Kysely<TenantDatabase>, input: CreateAutoJournalEntryInput): Promise<JournalEntryWithLines> {
    const existing = await this.entries.findBySourceReference(
      db,
      input.sourceReferenceType,
      input.sourceReferenceId,
    );
    if (existing) {
      if (existing.status === 'posted') {
        const lines = await this.lines.listByJournalEntryId(db, existing.id);
        return { ...existing, lines };
      }
      if (existing.status === 'draft') {
        return this.post(db, existing.id);
      }
      throw new BusinessRuleError(
        `Journal entry "${existing.entryNumber}" (auto-generated for ${input.sourceReferenceType} ` +
          `"${input.sourceReferenceId}") is "${existing.status}" — cannot be auto-posted again.`,
        {
          code: 'JOURNAL_ENTRY.AUTO_ALREADY_PROCESSED',
          params: {
            entryNumber: existing.entryNumber,
            sourceReferenceType: input.sourceReferenceType,
            sourceReferenceId: input.sourceReferenceId,
            status: existing.status,
          },
        },
      );
    }

    const tenantSettings = await this.tenantSettings.get(db);
    const currency = tenantSettings.currencyCode;
    const builtLines = await this.buildAndValidateLines(db, currency, input.lines);

    let created: JournalEntryWithLines;
    try {
      created = await db.transaction().execute(async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'journal_entry', null);
        const entry = await this.entries.create(trx, {
          entryNumber: allocated.formatted,
          entryDate: input.entryDate,
          currency,
          source: 'auto',
          description: input.description ?? null,
          notes: null,
          customFields: {},
          sourceReferenceType: input.sourceReferenceType,
          sourceReferenceId: input.sourceReferenceId,
        });
        const lines = await this.lines.createMany(trx, entry.id, builtLines);
        return { ...entry, lines };
      });
    } catch (err) {
      // A genuine race with another attempt for the same source
      // reference (the findBySourceReference check above and this
      // INSERT are not atomic together) — the partial unique index from
      // migration 0051 is the real guarantee. Re-read and proceed the
      // same way the "already existed" branch above would have.
      if (!isPostgresUniqueViolation(err)) throw err;
      const raced = await this.entries.findBySourceReference(
        db,
        input.sourceReferenceType,
        input.sourceReferenceId,
      );
      if (!raced) throw err;
      if (raced.status === 'posted') {
        const lines = await this.lines.listByJournalEntryId(db, raced.id);
        return { ...raced, lines };
      }
      return this.post(db, raced.id);
    }

    return this.post(db, created.id);
  }
}
