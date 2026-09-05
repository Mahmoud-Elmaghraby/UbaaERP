import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { QUOTATION_REPOSITORY, type QuotationRepository } from '../ports/quotation.repository';
import { QUOTATION_LINE_REPOSITORY, type QuotationLineRepository } from '../ports/quotation-line.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import {
  assertSingleCurrency,
  calculateQuotationTotal,
  type Quotation,
  type QuotationWithLines,
  type QuotationStatus,
  type CreateQuotationInput,
  type UpdateQuotationInput,
} from '../../domain/quotation.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(QUOTATION_LINE_REPOSITORY) private readonly lines: QuotationLineRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Quotation[]> {
    return this.quotations.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<QuotationWithLines> {
    const quotation = await this.quotations.findById(db, id);
    if (!quotation) throw new NotFoundError(`Quotation "${id}" not found.`);
    const lines = await this.lines.listByQuotationId(db, id);
    return { ...quotation, lines, totalAmount: calculateQuotationTotal(lines) };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateQuotationInput): Promise<QuotationWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A quotation must have at least one line.');
    }
    try {
      assertSingleCurrency(input.lines);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }

    const customer = await this.customers.findById(db, input.customerId);
    if (!customer) throw new NotFoundError(`Customer "${input.customerId}" not found.`);

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(db, 'quotation', null);
    } catch {
      throw new BusinessRuleError(
        'No numbering sequence configured for quotations yet. ' +
          'Create one for document type "quotation" via Settings → Numbering Sequences first.',
      );
    }

    return db.transaction().execute(async (trx) => {
      const quotation = await this.quotations.create(trx, {
        quotationNumber: allocated.formatted,
        customerId: input.customerId,
        validUntilDate: input.validUntilDate ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });

      const createdLines = [];
      for (const line of input.lines) {
        createdLines.push(await this.lines.create(trx, quotation.id, line));
      }

      return { ...quotation, lines: createdLines, totalAmount: calculateQuotationTotal(createdLines) };
    });
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateQuotationInput): Promise<QuotationWithLines> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw new NotFoundError(`Quotation "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`Quotation "${id}" is "${existing.status}" and can no longer be edited.`);
    }
    if (input.lines !== undefined) {
      if (input.lines.length === 0) throw new BusinessRuleError('A quotation must have at least one line.');
      try {
        assertSingleCurrency(input.lines);
      } catch (err) {
        throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
      }
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.quotations.update(trx, id, {
        validUntilDate: input.validUntilDate,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw new NotFoundError(`Quotation "${id}" not found.`);

      let lines = await this.lines.listByQuotationId(trx, id);
      if (input.lines !== undefined) {
        await this.lines.deleteByQuotationId(trx, id);
        lines = [];
        for (const line of input.lines) lines.push(await this.lines.create(trx, id, line));
      }

      return { ...updated, lines, totalAmount: calculateQuotationTotal(lines) };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: QuotationStatus[],
    to: QuotationStatus,
  ): Promise<Quotation> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw new NotFoundError(`Quotation "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move quotation "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.quotations.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`Quotation "${id}" not found.`);
    return updated;
  }

  send(db: Kysely<TenantDatabase>, id: string): Promise<Quotation> {
    return this.transitionStatus(db, id, ['draft'], 'sent');
  }

  accept(db: Kysely<TenantDatabase>, id: string): Promise<Quotation> {
    return this.transitionStatus(db, id, ['sent'], 'accepted');
  }

  reject(db: Kysely<TenantDatabase>, id: string): Promise<Quotation> {
    return this.transitionStatus(db, id, ['sent'], 'rejected');
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<Quotation> {
    return this.transitionStatus(db, id, ['draft', 'sent'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw new NotFoundError(`Quotation "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Quotation "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.quotations.delete(db, id);
  }
}
