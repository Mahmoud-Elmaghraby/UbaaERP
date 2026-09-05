import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../ports/sales-order.repository';
import {
  SALES_ORDER_LINE_REPOSITORY,
  type SalesOrderLineRepository,
} from '../ports/sales-order-line.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import { QUOTATION_REPOSITORY, type QuotationRepository } from '../ports/quotation.repository';
import { QUOTATION_LINE_REPOSITORY, type QuotationLineRepository } from '../ports/quotation-line.repository';
import {
  assertSingleCurrency,
  calculateSalesOrderTotal,
  type SalesOrder,
  type SalesOrderWithLines,
  type SalesOrderStatus,
  type CreateSalesOrderInput,
  type CreateSalesOrderLineInput,
  type UpdateSalesOrderInput,
} from '../../domain/sales-order.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

@Injectable()
export class SalesOrdersService {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly lines: SalesOrderLineRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(QUOTATION_LINE_REPOSITORY) private readonly quotationLines: QuotationLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SalesOrder[]> {
    return this.orders.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrderWithLines> {
    const order = await this.orders.findById(db, id);
    if (!order) throw new NotFoundError(`Sales order "${id}" not found.`);
    const lines = await this.lines.listBySalesOrderId(db, id);
    return { ...order, lines, totalAmount: calculateSalesOrderTotal(lines) };
  }

  /**
   * Resolves the (customerId, lines) pair for a new sales order — either
   * derived 1:1 from an 'accepted' quotation, or given directly (no
   * quotation involved). Exactly one path; mixing both is rejected as
   * ambiguous. Mirrors PurchaseOrdersService.resolveSupplierAndLines().
   */
  private async resolveCustomerAndLines(
    db: Kysely<TenantDatabase>,
    input: CreateSalesOrderInput,
  ): Promise<{ customerId: string; lines: CreateSalesOrderLineInput[] }> {
    if (input.sourceQuotationId) {
      if (input.customerId || input.lines) {
        throw new BusinessRuleError(
          'Provide either sourceQuotationId or customerId + lines directly — not both.',
        );
      }
      const quotation = await this.quotations.findById(db, input.sourceQuotationId);
      if (!quotation) throw new NotFoundError(`Quotation "${input.sourceQuotationId}" not found.`);
      if (quotation.status !== 'accepted') {
        throw new BusinessRuleError(
          `Quotation "${input.sourceQuotationId}" is "${quotation.status}", not "accepted" — ` +
            'a sales order can only be raised from an accepted quotation.',
        );
      }
      const quotationLines = await this.quotationLines.listByQuotationId(db, quotation.id);
      return {
        customerId: quotation.customerId,
        lines: quotationLines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          notes: line.notes,
        })),
      };
    }

    if (!input.customerId || !input.lines || input.lines.length === 0) {
      throw new BusinessRuleError(
        'Provide a sourceQuotationId, or a customerId with at least one line, to create a sales order.',
      );
    }
    const customer = await this.customers.findById(db, input.customerId);
    if (!customer) throw new NotFoundError(`Customer "${input.customerId}" not found.`);
    return { customerId: input.customerId, lines: input.lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesOrderInput): Promise<SalesOrderWithLines> {
    const { customerId, lines } = await this.resolveCustomerAndLines(db, input);
    try {
      assertSingleCurrency(lines);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(db, 'sales_order', null);
    } catch {
      throw new BusinessRuleError(
        'No numbering sequence configured for sales orders yet. ' +
          'Create one for document type "sales_order" via Settings → Numbering Sequences first.',
      );
    }

    return db.transaction().execute(async (trx) => {
      const order = await this.orders.create(trx, {
        soNumber: allocated.formatted,
        customerId,
        sourceQuotationId: input.sourceQuotationId ?? null,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });

      const createdLines = [];
      for (const line of lines) {
        createdLines.push(await this.lines.create(trx, order.id, line));
      }

      return { ...order, lines: createdLines, totalAmount: calculateSalesOrderTotal(createdLines) };
    });
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateSalesOrderInput,
  ): Promise<SalesOrderWithLines> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales order "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`Sales order "${id}" is "${existing.status}" and can no longer be edited.`);
    }
    if (input.lines !== undefined) {
      if (input.lines.length === 0) throw new BusinessRuleError('A sales order must have at least one line.');
      try {
        assertSingleCurrency(input.lines);
      } catch (err) {
        throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
      }
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.orders.update(trx, id, {
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw new NotFoundError(`Sales order "${id}" not found.`);

      let lines = await this.lines.listBySalesOrderId(trx, id);
      if (input.lines !== undefined) {
        await this.lines.deleteBySalesOrderId(trx, id);
        lines = [];
        for (const line of input.lines) lines.push(await this.lines.create(trx, id, line));
      }

      return { ...updated, lines, totalAmount: calculateSalesOrderTotal(lines) };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: SalesOrderStatus[],
    to: SalesOrderStatus,
  ): Promise<SalesOrder> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales order "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move sales order "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.orders.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`Sales order "${id}" not found.`);
    return updated;
  }

  confirm(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrder> {
    return this.transitionStatus(db, id, ['draft'], 'confirmed');
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrder> {
    return this.transitionStatus(db, id, ['draft', 'confirmed'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales order "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Sales order "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.orders.delete(db, id);
  }
}
