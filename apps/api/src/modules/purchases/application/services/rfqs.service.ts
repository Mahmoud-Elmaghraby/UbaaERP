import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { RFQ_REPOSITORY, type RfqRepository } from '../ports/rfq.repository';
import { RFQ_LINE_REPOSITORY, type RfqLineRepository } from '../ports/rfq-line.repository';
import { RFQ_SUPPLIER_REPOSITORY, type RfqSupplierRepository } from '../ports/rfq-supplier.repository';
import {
  PURCHASE_REQUISITION_REPOSITORY,
  type PurchaseRequisitionRepository,
} from '../ports/purchase-requisition.repository';
import type { Rfq, RfqWithDetails, RfqStatus, CreateRfqInput, UpdateRfqInput } from '../../domain/rfq.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

@Injectable()
export class RfqsService {
  constructor(
    @Inject(RFQ_REPOSITORY) private readonly rfqs: RfqRepository,
    @Inject(RFQ_LINE_REPOSITORY) private readonly lines: RfqLineRepository,
    @Inject(RFQ_SUPPLIER_REPOSITORY) private readonly invitedSuppliers: RfqSupplierRepository,
    @Inject(PURCHASE_REQUISITION_REPOSITORY) private readonly requisitions: PurchaseRequisitionRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Rfq[]> {
    return this.rfqs.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<RfqWithDetails> {
    const rfq = await this.rfqs.findById(db, id);
    if (!rfq) throw new NotFoundError(`RFQ "${id}" not found.`);
    const [lines, supplierIds] = await Promise.all([
      this.lines.listByRfqId(db, id),
      this.invitedSuppliers.listSupplierIdsByRfqId(db, id),
    ]);
    return { ...rfq, lines, supplierIds };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateRfqInput): Promise<RfqWithDetails> {
    if (input.lines.length === 0) throw new BusinessRuleError('An RFQ must have at least one line.');
    if (input.supplierIds.length === 0) {
      throw new BusinessRuleError('An RFQ must invite at least one supplier to quote.');
    }

    if (input.sourceRequisitionId) {
      const requisition = await this.requisitions.findById(db, input.sourceRequisitionId);
      if (!requisition) {
        throw new NotFoundError(`Purchase requisition "${input.sourceRequisitionId}" not found.`);
      }
      if (requisition.status !== 'approved') {
        throw new BusinessRuleError(
          `Purchase requisition "${input.sourceRequisitionId}" is "${requisition.status}", not "approved" — ` +
            'an RFQ can only be raised from an approved requisition.',
        );
      }
    }

    try {
      return await db.transaction().execute(async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'request_for_quotation', null);

        const rfq = await this.rfqs.create(trx, {
          rfqNumber: allocated.formatted,
          sourceRequisitionId: input.sourceRequisitionId ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of input.lines) {
          createdLines.push(await this.lines.create(trx, rfq.id, line));
        }
        for (const supplierId of input.supplierIds) {
          await this.invitedSuppliers.add(trx, rfq.id, supplierId);
        }

        return { ...rfq, lines: createdLines, supplierIds: input.supplierIds };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('One of the given product variants or suppliers does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for RFQs yet. ' +
            'Create one for document type "request_for_quotation" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateRfqInput): Promise<RfqWithDetails> {
    const existing = await this.rfqs.findById(db, id);
    if (!existing) throw new NotFoundError(`RFQ "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`RFQ "${id}" is "${existing.status}" and can no longer be edited.`);
    }
    if (input.lines !== undefined && input.lines.length === 0) {
      throw new BusinessRuleError('An RFQ must have at least one line.');
    }
    if (input.supplierIds !== undefined && input.supplierIds.length === 0) {
      throw new BusinessRuleError('An RFQ must invite at least one supplier to quote.');
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.rfqs.update(trx, id, { notes: input.notes, customFields: input.customFields });
      if (!updated) throw new NotFoundError(`RFQ "${id}" not found.`);

      let lines = await this.lines.listByRfqId(trx, id);
      if (input.lines !== undefined) {
        await this.lines.deleteByRfqId(trx, id);
        lines = [];
        for (const line of input.lines) lines.push(await this.lines.create(trx, id, line));
      }

      let supplierIds = await this.invitedSuppliers.listSupplierIdsByRfqId(trx, id);
      if (input.supplierIds !== undefined) {
        await this.invitedSuppliers.deleteByRfqId(trx, id);
        for (const supplierId of input.supplierIds) await this.invitedSuppliers.add(trx, id, supplierId);
        supplierIds = input.supplierIds;
      }

      return { ...updated, lines, supplierIds };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: RfqStatus[],
    to: RfqStatus,
  ): Promise<Rfq> {
    const existing = await this.rfqs.findById(db, id);
    if (!existing) throw new NotFoundError(`RFQ "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move RFQ "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.rfqs.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`RFQ "${id}" not found.`);
    return updated;
  }

  send(db: Kysely<TenantDatabase>, id: string): Promise<Rfq> {
    return this.transitionStatus(db, id, ['draft'], 'sent');
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<Rfq> {
    return this.transitionStatus(db, id, ['draft', 'sent'], 'cancelled');
  }

  /** Called by SupplierQuotationsService.select() — not exposed as its own HTTP action. */
  close(db: Kysely<TenantDatabase>, id: string): Promise<Rfq | null> {
    return this.rfqs.updateStatus(db, id, 'closed');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.rfqs.findById(db, id);
    if (!existing) throw new NotFoundError(`RFQ "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`RFQ "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    try {
      await this.rfqs.delete(db, id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(
          `RFQ "${id}" cannot be deleted — one or more supplier quotations already reference it.`,
        );
      }
      throw err;
    }
  }
}
