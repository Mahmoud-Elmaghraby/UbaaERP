import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { RecurringEntryDto, SaveRecurringEntryDto, CreateJournalEntryLineDto } from '@erp-platform/contracts';
import type { RecurringJournalEntriesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { localIsoDate } from '../../../../shared/time/local-date';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { JournalEntriesService } from './journal-entries.service';
import { addMonthsClamped } from './date-math';

const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;
/** Catch-up limit per template per run (a template left off for years can't flood the ledger). */
const MAX_CATCH_UP = 24;

/**
 * القيود المتكررة — a template (lines + frequency) that makes a journal
 * entry on each due date: monthly rent, depreciation by hand, accruals…
 * Each made entry is an ordinary manual entry (editable while a draft),
 * posted right away when the template says so. Due templates run on their
 * own (AccountingScheduler) and on demand ("generate now").
 */
@Injectable()
export class RecurringEntriesService {
  private readonly logger = new Logger(RecurringEntriesService.name);

  constructor(private readonly journalEntries: JournalEntriesService) {}

  async list(db: Kysely<TenantDatabase>): Promise<RecurringEntryDto[]> {
    const rows = await db.selectFrom('recurring_journal_entries').selectAll().orderBy('name').execute();
    return rows.map(toDto);
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveRecurringEntryDto): Promise<RecurringEntryDto> {
    assertBalanced(input.lines);
    const values = {
      name: input.name,
      description: input.description ?? null,
      frequency: input.frequency,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      auto_post: input.autoPost ?? false,
      is_active: input.isActive ?? true,
      lines: JSON.stringify(input.lines),
    };
    if (id) {
      const existing = await db.selectFrom('recurring_journal_entries').selectAll().where('id', '=', id).executeTakeFirst();
      if (!existing) throw entityNotFound('RECURRING_ENTRY', id);
      // A new start date before anything ran moves the schedule; afterwards the schedule keeps its place.
      const nextRunDate = existing.last_entry_id ? toDate(existing.next_run_date) : input.startDate;
      const row = await db
        .updateTable('recurring_journal_entries')
        .set({ ...values, next_run_date: nextRunDate, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDto(row);
    }
    const row = await db
      .insertInto('recurring_journal_entries')
      .values({ id: randomUUID(), ...values, next_run_date: input.startDate })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDto(row);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const result = await db.deleteFrom('recurring_journal_entries').where('id', '=', id).executeTakeFirst();
    if (!result.numDeletedRows) throw entityNotFound('RECURRING_ENTRY', id);
  }

  /** Makes every entry due up to `today` (one template at a time; a failing one is logged and skipped). */
  async generateDue(db: Kysely<TenantDatabase>, today = localIsoDate()): Promise<number> {
    const due = await db
      .selectFrom('recurring_journal_entries')
      .selectAll()
      .where('is_active', '=', true)
      .where('next_run_date', '<=', today)
      .execute();
    let made = 0;
    for (const template of due) {
      try {
        made += await this.runTemplate(db, template, today);
      } catch (err) {
        this.logger.warn(`Recurring entry "${template.name}" could not run: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return made;
  }

  private async runTemplate(db: Kysely<TenantDatabase>, template: Selectable<RecurringJournalEntriesTable>, today: string): Promise<number> {
    let next = toDate(template.next_run_date);
    const end = template.end_date ? toDate(template.end_date) : null;
    const step = STEP_MONTHS[template.frequency as keyof typeof STEP_MONTHS];
    const start = toDate(template.start_date);
    let made = 0;
    while (next <= today && (!end || next <= end) && made < MAX_CATCH_UP) {
      const entryDate = next;
      await withTransaction(db, async (trx) => {
        const entry = await this.journalEntries.create(trx, {
          entryDate,
          description: template.description ?? template.name,
          notes: `قيد متكرر: ${template.name}`,
          customFields: {},
          lines: template.lines as CreateJournalEntryLineDto[],
        });
        // With entry approval on, a made entry waits for an approver like any other manual entry.
        if (template.auto_post && !(await this.journalEntries.needsApproval(trx, entry))) await this.journalEntries.post(trx, entry.id);
        made += 1;
        // The n-th run is start + n steps, so a 31st keeps landing on month ends.
        const runs = monthsBetween(start, entryDate) / step + 1;
        next = addMonthsClamped(start, runs * step);
        await trx
          .updateTable('recurring_journal_entries')
          .set({ next_run_date: next, last_entry_id: entry.id, updated_at: new Date() })
          .where('id', '=', template.id)
          .execute();
      });
    }
    if (end && next > end) {
      await db.updateTable('recurring_journal_entries').set({ is_active: false, updated_at: new Date() }).where('id', '=', template.id).execute();
    }
    return made;
  }
}

function assertBalanced(lines: CreateJournalEntryLineDto[]): void {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    debit += BigInt(line.debitAmountMinorUnits);
    credit += BigInt(line.creditAmountMinorUnits);
  }
  if (debit !== credit || debit === 0n) {
    throw new BusinessRuleError('The recurring entry lines do not balance.', { code: 'JOURNAL_ENTRY.POST_NOT_BALANCED', params: { entryNumber: '' } });
  }
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!);
}

function toDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}

function toDto(row: Selectable<RecurringJournalEntriesTable>): RecurringEntryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    frequency: row.frequency as RecurringEntryDto['frequency'],
    startDate: toDate(row.start_date),
    nextRunDate: toDate(row.next_run_date),
    endDate: row.end_date ? toDate(row.end_date) : null,
    autoPost: row.auto_post,
    isActive: row.is_active,
    lines: row.lines as CreateJournalEntryLineDto[],
    lastEntryId: row.last_entry_id,
  };
}
