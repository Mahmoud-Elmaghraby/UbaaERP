import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { JournalEntry, JournalEntryFilters, JournalEntryStatus, JournalEntrySource } from '../../domain/journal-entry.entity';

/** Repository-level create input — entryNumber/currency/source/reversalOfEntryId are decided by JournalEntriesService, not the caller-facing DTO. */
export interface CreateJournalEntryRow {
  entryNumber: string;
  entryDate: string;
  currency: string;
  source: JournalEntrySource;
  description?: string | null;
  reversalOfEntryId?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
}

export interface UpdateJournalEntryRow {
  entryDate?: string;
  description?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface JournalEntryRepository {
  list(db: Kysely<TenantDatabase>, filters?: JournalEntryFilters): Promise<JournalEntry[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntry | null>;
  /** The idempotency lookup Stage 6/7 auto-posting listeners use before creating a new entry — see migration 0051. */
  findBySourceReference(
    db: Kysely<TenantDatabase>,
    sourceReferenceType: string,
    sourceReferenceId: string,
  ): Promise<JournalEntry | null>;
  create(db: Kysely<TenantDatabase>, input: CreateJournalEntryRow): Promise<JournalEntry>;
  /** Updates a DRAFT only — null when the entry is gone or no longer a draft. */
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateJournalEntryRow): Promise<JournalEntry | null>;
  /** With `expectedStatus`, changes the row only while it still has that status (null otherwise) — guards concurrent post/cancel. */
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: JournalEntryStatus,
    postedAt?: Date | null,
    expectedStatus?: JournalEntryStatus,
  ): Promise<JournalEntry | null>;
  /** A non-cancelled entry that reverses `id`, if any. */
  findActiveReversalOf(db: Kysely<TenantDatabase>, id: string): Promise<JournalEntry | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const JOURNAL_ENTRY_REPOSITORY = Symbol('JOURNAL_ENTRY_REPOSITORY');
