import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../ports/purchase-order.repository';
import {
  PURCHASE_ORDER_LINE_REPOSITORY,
  type PurchaseOrderLineRepository,
} from '../ports/purchase-order-line.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../ports/supplier.repository';
import {
  SUPPLIER_QUOTATION_REPOSITORY,
  type SupplierQuotationRepository,
} from '../ports/supplier-quotation.repository';
import {
  SUPPLIER_QUOTATION_LINE_REPOSITORY,
  type SupplierQuotationLineRepository,
} from '../ports/supplier-quotation-line.repository';
import {
  assertSingleCurrency,
  calculatePurchaseOrderTotal,
  type PurchaseOrder,
  type PurchaseOrderWithLines,
  type PurchaseOrderStatus,
  type CreatePurchaseOrderInput,
  type CreatePurchaseOrderLineInput,
  type UpdatePurchaseOrderInput,
} from '../../domain/purchase-order.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_LINE_REPOSITORY) private readonly lines: PurchaseOrderLineRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(SUPPLIER_QUOTATION_REPOSITORY) private readonly quotations: SupplierQuotationRepository,
    @Inject(SUPPLIER_QUOTATION_LINE_REPOSITORY) private readonly quotationLines: SupplierQuotationLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<PurchaseOrder[]> {
    return this.orders.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrderWithLines> {
    const order = await this.orders.findById(db, id);
    if (!order) throw new NotFoundError(`Purchase order "${id}" not found.`);
    const lines = await this.lines.listByPurchaseOrderId(db, id);
    return { ...order, lines, totalAmount: calculatePurchaseOrderTotal(lines) };
  }

  /**
   * Resolves the (supplierId, lines) pair for a new PO — either derived
   * 1:1 from a 'selected' supplier quotation, or given directly (no RFQ
   * involved). Exactly one path; mixing both is rejected as ambiguous.
   */
  private async resolveSupplierAndLines(
    db: Kysely<TenantDatabase>,
    input: CreatePurchaseOrderInput,
  ): Promise<{ supplierId: string; lines: CreatePurchaseOrderLineInput[] }> {
    if (input.sourceQuotationId) {
      if (input.supplierId || input.lines) {
        throw new BusinessRuleError(
          'Provide either sourceQuotationId or supplierId + lines directly — not both.',
        );
      }
      const quotation = await this.quotations.findById(db, input.sourceQuotationId);
      if (!quotation) throw new NotFoundError(`Supplier quotation "${input.sourceQuotationId}" not found.`);
      if (quotation.status !== 'selected') {
        throw new BusinessRuleError(
          `Supplier quotation "${input.sourceQuotationId}" is "${quotation.status}", not "selected" — ` +
            'a purchase order can only be raised from a selected quotation.',
        );
      }
      const quotationLines = await this.quotationLines.listByQuotationId(db, quotation.id);
      return {
        supplierId: quotation.supplierId,
        lines: quotationLines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          notes: line.notes,
        })),
      };
    }

    if (!input.supplierId || !input.lines || input.lines.length === 0) {
      throw new BusinessRuleError(
        'Provide a sourceQuotationId, or a supplierId with at least one line, to create a purchase order.',
      );
    }
    const supplier = await this.suppliers.findById(db, input.supplierId);
    if (!supplier) throw new NotFoundError(`Supplier "${input.supplierId}" not found.`);
    return { supplierId: input.supplierId, lines: input.lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithLines> {
    const { supplierId, lines } = await this.resolveSupplierAndLines(db, input);
    try {
      assertSingleCurrency(lines);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(db, 'purchase_order', null);
    } catch {
      throw new BusinessRuleError(
        'No numbering sequence configured for purchase orders yet. ' +
          'Create one for document type "purchase_order" via Settings → Numbering Sequences first.',
      );
    }

    return db.transaction().execute(async (trx) => {
      const order = await this.orders.create(trx, {
        poNumber: allocated.formatted,
        supplierId,
        sourceQuotationId: input.sourceQuotationId ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });

      const createdLines = [];
      for (const line of lines) {
        createdLines.push(await this.lines.create(trx, order.id, line));
      }

      return { ...order, lines: createdLines, totalAmount: calculatePurchaseOrderTotal(createdLines) };
    });
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseOrderInput,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase order "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`Purchase order "${id}" is "${existing.status}" and can no longer be edited.`);
    }
    if (input.lines !== undefined) {
      if (input.lines.length === 0) throw new BusinessRuleError('A purchase order must have at least one line.');
      try {
        assertSingleCurrency(input.lines);
      } catch (err) {
        throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
      }
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.orders.update(trx, id, {
        expectedDeliveryDate: input.expectedDeliveryDate,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw new NotFoundError(`Purchase order "${id}" not found.`);

      let lines = await this.lines.listByPurchaseOrderId(trx, id);
      if (input.lines !== undefined) {
        await this.lines.deleteByPurchaseOrderId(trx, id);
        lines = [];
        for (const line of input.lines) lines.push(await this.lines.create(trx, id, line));
      }

      return { ...updated, lines, totalAmount: calculatePurchaseOrderTotal(lines) };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: PurchaseOrderStatus[],
    to: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase order "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move purchase order "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.orders.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`Purchase order "${id}" not found.`);
    return updated;
  }

  confirm(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrder> {
    return this.transitionStatus(db, id, ['draft'], 'confirmed');
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrder> {
    return this.transitionStatus(db, id, ['draft', 'confirmed'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase order "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase order "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.orders.delete(db, id);
  }
}
