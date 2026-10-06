import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  NUMBERING_SEQUENCE_REPOSITORY,
  type NumberingSequenceRepository,
} from '../ports/numbering-sequence.repository';
import type {
  AllocatedDocumentNumber,
  CreateNumberingSequenceInput,
  NumberingSequence,
  UpdateNumberingSequenceInput,
} from '../../domain/numbering-sequence.entity';
import { ConflictError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class NumberingSequencesService {
  constructor(
    @Inject(NUMBERING_SEQUENCE_REPOSITORY) private readonly repository: NumberingSequenceRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<NumberingSequence[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<NumberingSequence> {
    const sequence = await this.repository.findById(db, id);
    if (!sequence) throw entityNotFound('NUMBERING_SEQUENCE', id);
    return sequence;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateNumberingSequenceInput,
  ): Promise<NumberingSequence> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          `A numbering sequence for document type "${input.documentType}"` +
            (input.branchId ? ` and this branch` : ' (tenant-wide)') +
            ' already exists.',
          { code: 'NUMBERING_SEQUENCE.DUPLICATE', params: { documentType: input.documentType } },
        );
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateNumberingSequenceInput,
  ): Promise<NumberingSequence> {
    const updated = await this.repository.update(db, id, input);
    if (!updated) throw entityNotFound('NUMBERING_SEQUENCE', id);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('NUMBERING_SEQUENCE', id);
  }

  /** See NumberingSequenceRepository.ensureTenantWide — used by modules that number on demand (e.g. product codes). */
  ensureTenantWide(
    db: Kysely<TenantDatabase>,
    documentType: string,
    defaults: { prefix: string | null; paddingLength: number },
  ): Promise<void> {
    return this.repository.ensureTenantWide(db, documentType, defaults);
  }

  /** Used by later modules (Sales, Purchases, ...) to number a new document. */
  allocateNext(
    db: Kysely<TenantDatabase>,
    documentType: string,
    branchId: string | null = null,
  ): Promise<AllocatedDocumentNumber> {
    return this.repository.allocateNext(db, documentType, branchId);
  }
}
