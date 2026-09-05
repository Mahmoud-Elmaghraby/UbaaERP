import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  PURCHASE_REQUISITION_REPOSITORY,
  type PurchaseRequisitionRepository,
} from '../ports/purchase-requisition.repository';
import {
  PURCHASE_REQUISITION_LINE_REPOSITORY,
  type PurchaseRequisitionLineRepository,
} from '../ports/purchase-requisition-line.repository';
import type {
  PurchaseRequisition,
  PurchaseRequisitionWithLines,
  PurchaseRequisitionStatus,
  CreatePurchaseRequisitionInput,
  UpdatePurchaseRequisitionInput,
} from '../../domain/purchase-requisition.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

/**
 * requisition_number is allocated from Settings' shared numbering_sequences
 * mechanism (document_type = 'purchase_requisition') rather than a
 * Purchases-local counter — see migration 0030's class comment for why
 * this cross-module service call is treated as a foundational/platform
 * dependency (like TenancyModule/AuthInfraModule, which every module
 * already depends on directly), not the kind of business-module-to-
 * business-module call CLAUDE.md §2.6 forbids. Flagged here as an
 * implementation decision, not an explicit master-doc rule.
 */
@Injectable()
export class PurchaseRequisitionsService {
  constructor(
    @Inject(PURCHASE_REQUISITION_REPOSITORY) private readonly requisitions: PurchaseRequisitionRepository,
    @Inject(PURCHASE_REQUISITION_LINE_REPOSITORY) private readonly lines: PurchaseRequisitionLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<PurchaseRequisition[]> {
    return this.requisitions.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisitionWithLines> {
    const requisition = await this.requisitions.findById(db, id);
    if (!requisition) throw new NotFoundError(`Purchase requisition "${id}" not found.`);
    const lines = await this.lines.listByRequisitionId(db, id);
    return { ...requisition, lines };
  }

  async create(
    db: Kysely<TenantDatabase>,
    actorUserId: string,
    input: Omit<CreatePurchaseRequisitionInput, 'requestedBy'>,
  ): Promise<PurchaseRequisitionWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A purchase requisition must have at least one line.');
    }

    return db.transaction().execute(async (trx) => {
      let allocated;
      try {
        allocated = await this.numberingSequences.allocateNext(
          trx,
          'purchase_requisition',
          input.branchId ?? null,
        );
      } catch {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase requisitions yet. ' +
            'Create one for document type "purchase_requisition" via Settings → Numbering Sequences first.',
        );
      }

      const requisition = await this.requisitions.create(trx, {
        requisitionNumber: allocated.formatted,
        requestedBy: actorUserId,
        branchId: input.branchId ?? null,
        neededByDate: input.neededByDate ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });

      const createdLines = [];
      for (const line of input.lines) {
        createdLines.push(await this.lines.create(trx, requisition.id, line));
      }

      return { ...requisition, lines: createdLines };
    });
  }

  /**
   * Header fields + (optionally) a wholesale line replacement — only
   * while the requisition is still a draft. Once submitted, a requisition
   * is either approved/rejected/cancelled, not silently edited.
   */
  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseRequisitionInput,
  ): Promise<PurchaseRequisitionWithLines> {
    const existing = await this.requisitions.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase requisition "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Purchase requisition "${id}" is "${existing.status}" and can no longer be edited — only draft requisitions can be changed.`,
      );
    }
    if (input.lines !== undefined && input.lines.length === 0) {
      throw new BusinessRuleError('A purchase requisition must have at least one line.');
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.requisitions.update(trx, id, {
        branchId: input.branchId,
        neededByDate: input.neededByDate,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw new NotFoundError(`Purchase requisition "${id}" not found.`);

      let lines = await this.lines.listByRequisitionId(trx, id);
      if (input.lines !== undefined) {
        await this.lines.deleteByRequisitionId(trx, id);
        lines = [];
        for (const line of input.lines) {
          lines.push(await this.lines.create(trx, id, line));
        }
      }

      return { ...updated, lines };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: PurchaseRequisitionStatus[],
    to: PurchaseRequisitionStatus,
  ): Promise<PurchaseRequisition> {
    const existing = await this.requisitions.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase requisition "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move purchase requisition "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.requisitions.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`Purchase requisition "${id}" not found.`);
    return updated;
  }

  submit(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition> {
    return this.transitionStatus(db, id, ['draft'], 'submitted');
  }

  approve(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition> {
    return this.transitionStatus(db, id, ['submitted'], 'approved');
  }

  reject(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition> {
    return this.transitionStatus(db, id, ['submitted'], 'rejected');
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition> {
    return this.transitionStatus(db, id, ['draft', 'submitted'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.requisitions.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase requisition "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(
        `Purchase requisition "${id}" is "${existing.status}" and cannot be deleted — only draft or cancelled requisitions can be.`,
      );
    }
    await this.requisitions.delete(db, id);
  }
}
