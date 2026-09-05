import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { JournalEntriesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  JournalEntryRepository,
  CreateJournalEntryRow,
  UpdateJournalEntryRow,
} from '../../application/ports/journal-entry.repository';
import type { JournalEntry, JournalEntryFilters, JournalEntryStatus } from '../../domain/journal-entry.entity';

function toDomain(row: Selectable<JournalEntriesTable>): JournalEntry {
  return {
    id: row.id,
    entryNumber: row.entry_number,
    entryDate: row.entry_date,
    currency: row.currency,
    status: row.status as JournalEntry['status'],
    source: row.source as JournalEntry['source'],
    description: row.description,
    reversalOfEntryId: row.reversal_of_entry_id,
    postedAt: row.posted_at,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    sourceReferenceType: row.source_reference_type,
    sourceReferenceId: row.source_reference_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyJournalEntryRepository implements JournalEntryRepository {
  async list(db: Kysely<TenantDatabase>, filters?: JournalEntryFilters): Promise<JournalEntry[]> {
    let query = db.selectFrom('journal_entries').selectAll();
    if (filters?.status) query = query.where('status', '=', filters.status);
    if (filters?.fromDate) query = query.where('entry_date', '>=', filters.fromDate);
    if (filters?.toDate) query = query.where('entry_date', '<=', filters.toDate);
    const rows = await query.orderBy('entry_date', 'desc').orderBy('entry_number', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntry | null> {
    const row = await db.selectFrom('journal_entries').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateJournalEntryRow): Promise<JournalEntry> {
    const row = await db
      .insertInto('journal_entries')
      .values({
        id: randomUUID(),
        entry_number: input.entryNumber,
        entry_date: input.entryDate,
        currency: input.currency,
        source: input.source,
        description: input.description ?? null,
        reversal_of_entry_id: input.reversalOfEntryId ?? null,
        notes: input.notes ?? null,
        custom_fields: JSON.stringify(input.customFields ?? {}),
        source_reference_type: input.sourceReferenceType ?? null,
        source_reference_id: input.sourceReferenceId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findBySourceReference(
    db: Kysely<TenantDatabase>,
    sourceReferenceType: string,
    sourceReferenceId: string,
  ): Promise<JournalEntry | null> {
    const row = await db
      .selectFrom('journal_entries')
      .selectAll()
      .where('source_reference_type', '=', sourceReferenceType)
      .where('source_reference_id', '=', sourceReferenceId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateJournalEntryRow): Promise<JournalEntry | null> {
    const row = await db
      .updateTable('journal_entries')
      .set({
        ...(input.entryDate !== undefined ? { entry_date: input.entryDate } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: JournalEntryStatus,
    postedAt?: Date | null,
  ): Promise<JournalEntry | null> {
    const row = await db
      .updateTable('journal_entries')
      .set({
        status,
        ...(postedAt !== undefined ? { posted_at: postedAt } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('journal_entries').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
