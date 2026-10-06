import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  AllocatedDocumentNumber,
  CreateNumberingSequenceInput,
  NumberingSequence,
  UpdateNumberingSequenceInput,
} from '../../domain/numbering-sequence.entity';

export interface NumberingSequenceRepository {
  list(db: Kysely<TenantDatabase>): Promise<NumberingSequence[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<NumberingSequence | null>;
  create(
    db: Kysely<TenantDatabase>,
    input: CreateNumberingSequenceInput,
  ): Promise<NumberingSequence>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateNumberingSequenceInput,
  ): Promise<NumberingSequence | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
  /**
   * Atomically claims the next number for (documentType, branchId) and
   * returns it formatted. Must be safe under concurrent callers (two
   * invoices issued at the same time must never get the same number) —
   * implemented as a single UPDATE ... RETURNING, not read-then-write.
   */
  /**
   * Creates the tenant-wide (branch_id NULL) sequence for documentType with
   * these defaults if none exists yet; a no-op otherwise (never changes an
   * existing sequence). Safe under concurrent callers.
   */
  ensureTenantWide(
    db: Kysely<TenantDatabase>,
    documentType: string,
    defaults: { prefix: string | null; paddingLength: number },
  ): Promise<void>;
  allocateNext(
    db: Kysely<TenantDatabase>,
    documentType: string,
    branchId: string | null,
  ): Promise<AllocatedDocumentNumber>;
}

export const NUMBERING_SEQUENCE_REPOSITORY = Symbol('NUMBERING_SEQUENCE_REPOSITORY');
