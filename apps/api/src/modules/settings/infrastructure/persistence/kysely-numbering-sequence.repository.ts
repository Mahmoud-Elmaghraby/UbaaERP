import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { NumberingSequencesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import type { NumberingSequenceRepository } from '../../application/ports/numbering-sequence.repository';
import type {
  AllocatedDocumentNumber,
  CreateNumberingSequenceInput,
  NumberingSequence,
  UpdateNumberingSequenceInput,
} from '../../domain/numbering-sequence.entity';

function toDomain(row: Selectable<NumberingSequencesTable>): NumberingSequence {
  return {
    id: row.id,
    documentType: row.document_type,
    branchId: row.branch_id,
    prefix: row.prefix,
    nextNumber: row.next_number,
    paddingLength: row.padding_length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyNumberingSequenceRepository implements NumberingSequenceRepository {
  async list(db: Kysely<TenantDatabase>): Promise<NumberingSequence[]> {
    const rows = await db.selectFrom('numbering_sequences').selectAll().orderBy('document_type').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<NumberingSequence | null> {
    const row = await db
      .selectFrom('numbering_sequences')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateNumberingSequenceInput,
  ): Promise<NumberingSequence> {
    const row = await db
      .insertInto('numbering_sequences')
      .values({
        id: randomUUID(),
        document_type: input.documentType,
        branch_id: input.branchId ?? null,
        prefix: input.prefix ?? null,
        next_number: input.nextNumber ?? 1,
        padding_length: input.paddingLength ?? 5,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateNumberingSequenceInput,
  ): Promise<NumberingSequence | null> {
    const row = await db
      .updateTable('numbering_sequences')
      .set({
        ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
        ...(input.nextNumber !== undefined ? { next_number: input.nextNumber } : {}),
        ...(input.paddingLength !== undefined ? { padding_length: input.paddingLength } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('numbering_sequences').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async ensureTenantWide(
    db: Kysely<TenantDatabase>,
    documentType: string,
    defaults: { prefix: string | null; paddingLength: number },
  ): Promise<void> {
    // Target-less ON CONFLICT DO NOTHING: the uniqueness is an expression
    // index (COALESCE(branch_id, sentinel)), which a plain column list
    // can't name — and swallowing the conflict as a statement-level no-op
    // keeps the surrounding transaction usable (catching a unique-violation
    // error would abort it).
    await sql`
      INSERT INTO numbering_sequences (id, document_type, branch_id, prefix, padding_length)
      VALUES (gen_random_uuid(), ${documentType}, NULL, ${defaults.prefix}, ${defaults.paddingLength})
      ON CONFLICT DO NOTHING
    `.execute(db);
  }

  async allocateNext(
    db: Kysely<TenantDatabase>,
    documentType: string,
    branchId: string | null,
  ): Promise<AllocatedDocumentNumber> {
    // Single atomic UPDATE ... RETURNING: Postgres row-level locking makes
    // this safe under concurrent callers — two invoices issued at once can
    // never be handed the same number. `next_number - 1` recovers the
    // pre-increment value (the number actually being allocated now).
    // IS NOT DISTINCT FROM (not `=`) is required because branch_id may be
    // NULL (see migration 0003's sentinel-UUID unique index).
    const result = await sql<{
      id: string;
      prefix: string | null;
      padding_length: number;
      allocated_number: number;
    }>`
      UPDATE numbering_sequences
      SET next_number = next_number + 1, updated_at = now()
      WHERE document_type = ${documentType}
        AND branch_id IS NOT DISTINCT FROM ${branchId}
      RETURNING id, prefix, padding_length, (next_number - 1) AS allocated_number
    `.execute(db);

    const row = result.rows[0];
    if (!row) {
      throw new BusinessRuleError(
        `No numbering sequence configured for document_type "${documentType}"` +
          (branchId ? ` and branch "${branchId}"` : ' (tenant-wide)') +
          '. Create one via the numbering-sequences API first.',
        { code: 'NUMBERING_SEQUENCE.NOT_CONFIGURED', params: { documentType } },
      );
    }

    const paddedNumber = String(row.allocated_number).padStart(row.padding_length, '0');
    return {
      sequenceId: row.id,
      number: row.allocated_number,
      formatted: `${row.prefix ?? ''}${paddedNumber}`,
    };
  }
}
