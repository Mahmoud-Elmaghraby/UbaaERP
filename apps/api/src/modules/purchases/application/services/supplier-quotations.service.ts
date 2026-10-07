import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  SUPPLIER_QUOTATION_REPOSITORY,
  type SupplierQuotationRepository,
} from '../ports/supplier-quotation.repository';
import {
  SUPPLIER_QUOTATION_LINE_REPOSITORY,
  type SupplierQuotationLineRepository,
} from '../ports/supplier-quotation-line.repository';
import { RFQ_REPOSITORY, type RfqRepository } from '../ports/rfq.repository';
import { RFQ_SUPPLIER_REPOSITORY, type RfqSupplierRepository } from '../ports/rfq-supplier.repository';
import type {
  SupplierQuotation,
  SupplierQuotationWithLines,
  CreateSupplierQuotationInput,
  UpdateSupplierQuotationInput,
} from '../../domain/supplier-quotation.entity';
import { BusinessRuleError, ConflictError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { RfqsService } from './rfqs.service';
import { ProductUnitResolver } from '../../../../shared/catalog/product-unit-resolver';

@Injectable()
export class SupplierQuotationsService {
  constructor(
    @Inject(SUPPLIER_QUOTATION_REPOSITORY) private readonly quotations: SupplierQuotationRepository,
    @Inject(SUPPLIER_QUOTATION_LINE_REPOSITORY) private readonly lines: SupplierQuotationLineRepository,
    @Inject(RFQ_REPOSITORY) private readonly rfqs: RfqRepository,
    @Inject(RFQ_SUPPLIER_REPOSITORY) private readonly invitedSuppliers: RfqSupplierRepository,
    private readonly rfqsService: RfqsService,
    private readonly unitResolver: ProductUnitResolver,
  ) {}

  list(db: Kysely<TenantDatabase>, rfqId?: string): Promise<SupplierQuotation[]> {
    return this.quotations.list(db, rfqId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierQuotationWithLines> {
    const quotation = await this.quotations.findById(db, id);
    if (!quotation) throw entityNotFound('SUPPLIER_QUOTATION', id);
    const lines = await this.lines.listByQuotationId(db, id);
    return { ...quotation, lines };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateSupplierQuotationInput,
  ): Promise<SupplierQuotationWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A supplier quotation must have at least one line.', {
        code: 'SUPPLIER_QUOTATION.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const rfq = await this.rfqs.findById(db, input.rfqId);
    if (!rfq) throw entityNotFound('RFQ', input.rfqId);
    if (rfq.status !== 'sent') {
      throw new BusinessRuleError(
        `RFQ "${input.rfqId}" is "${rfq.status}", not "sent" — a supplier quotation can only be recorded ` +
          'against an RFQ that has actually been sent to suppliers.',
        { code: 'SUPPLIER_QUOTATION.RFQ_NOT_SENT', params: { rfqId: input.rfqId, status: rfq.status } },
      );
    }

    const invited = await this.invitedSuppliers.listSupplierIdsByRfqId(db, input.rfqId);
    if (!invited.includes(input.supplierId)) {
      throw new BusinessRuleError(
        `Supplier "${input.supplierId}" was not invited to quote on RFQ "${input.rfqId}".`,
        { code: 'SUPPLIER_QUOTATION.SUPPLIER_NOT_INVITED', params: { supplierId: input.supplierId, rfqId: input.rfqId } },
      );
    }

    const linesWithUnits = await this.unitResolver.resolve(db, input.lines);
    try {
      return await db.transaction().execute(async (trx) => {
        const quotation = await this.quotations.create(trx, {
          rfqId: input.rfqId,
          supplierId: input.supplierId,
          validUntil: input.validUntil ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of linesWithUnits) {
          createdLines.push(await this.lines.create(trx, quotation.id, line));
        }

        return { ...quotation, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          `Supplier "${input.supplierId}" already has a quotation recorded on RFQ "${input.rfqId}" — update it instead.`,
          {
            code: 'SUPPLIER_QUOTATION.ALREADY_EXISTS_FOR_SUPPLIER',
            params: { supplierId: input.supplierId, rfqId: input.rfqId },
          },
        );
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateSupplierQuotationInput,
  ): Promise<SupplierQuotationWithLines> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_QUOTATION', id);
    if (existing.status !== 'received') {
      throw new BusinessRuleError(
        `Supplier quotation "${id}" is "${existing.status}" and can no longer be edited.`,
        { code: 'SUPPLIER_QUOTATION.NOT_EDITABLE', params: { id, status: existing.status } },
      );
    }
    if (input.lines !== undefined && input.lines.length === 0) {
      throw new BusinessRuleError('A supplier quotation must have at least one line.', {
        code: 'SUPPLIER_QUOTATION.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const newLines = input.lines !== undefined ? await this.unitResolver.resolve(db, input.lines) : undefined;
    return db.transaction().execute(async (trx) => {
      const updated = await this.quotations.update(trx, id, {
        validUntil: input.validUntil,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw entityNotFound('SUPPLIER_QUOTATION', id);

      let lines = await this.lines.listByQuotationId(trx, id);
      if (newLines !== undefined) {
        await this.lines.deleteByQuotationId(trx, id);
        lines = [];
        for (const line of newLines) lines.push(await this.lines.create(trx, id, line));
      }

      return { ...updated, lines };
    });
  }

  /**
   * Picks this quotation as the winner: marks it 'selected', marks every
   * other still-'received' quotation under the same RFQ 'rejected', and
   * closes the RFQ. This is the hand-off point to Purchase Orders (next
   * stage — not built yet): a PO will eventually be created from a
   * 'selected' quotation, not invented from scratch.
   */
  async select(db: Kysely<TenantDatabase>, id: string): Promise<SupplierQuotation> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_QUOTATION', id);
    if (existing.status !== 'received') {
      throw new BusinessRuleError(
        `Supplier quotation "${id}" is "${existing.status}", not "received" — only a pending quotation can be selected.`,
        { code: 'SUPPLIER_QUOTATION.NOT_SELECTABLE', params: { id, status: existing.status } },
      );
    }

    return db.transaction().execute(async (trx) => {
      const selected = await this.quotations.updateStatus(trx, id, 'selected');
      if (!selected) throw entityNotFound('SUPPLIER_QUOTATION', id);

      const siblings = await this.quotations.listByRfqIdExcluding(trx, existing.rfqId, id);
      for (const sibling of siblings) {
        if (sibling.status === 'received') {
          await this.quotations.updateStatus(trx, sibling.id, 'rejected');
        }
      }

      await this.rfqsService.close(trx, existing.rfqId);
      return selected;
    });
  }

  async reject(db: Kysely<TenantDatabase>, id: string): Promise<SupplierQuotation> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_QUOTATION', id);
    if (existing.status !== 'received') {
      throw new BusinessRuleError(
        `Supplier quotation "${id}" is "${existing.status}", not "received" — only a pending quotation can be rejected.`,
        { code: 'SUPPLIER_QUOTATION.NOT_REJECTABLE', params: { id, status: existing.status } },
      );
    }
    const updated = await this.quotations.updateStatus(db, id, 'rejected');
    if (!updated) throw entityNotFound('SUPPLIER_QUOTATION', id);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.quotations.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_QUOTATION', id);
    if (existing.status !== 'received') {
      throw new BusinessRuleError(
        `Supplier quotation "${id}" is "${existing.status}" and cannot be deleted.`,
        { code: 'SUPPLIER_QUOTATION.NOT_DELETABLE', params: { id, status: existing.status } },
      );
    }
    await this.quotations.delete(db, id);
  }
}
