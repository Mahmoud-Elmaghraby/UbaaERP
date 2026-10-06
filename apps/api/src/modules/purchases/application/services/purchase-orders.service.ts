import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
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
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { assertCurrencyAllowedForTenant } from '../../../../shared/plans/currency-gate';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_LINE_REPOSITORY) private readonly lines: PurchaseOrderLineRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(SUPPLIER_QUOTATION_REPOSITORY) private readonly quotations: SupplierQuotationRepository,
    @Inject(SUPPLIER_QUOTATION_LINE_REPOSITORY) private readonly quotationLines: SupplierQuotationLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly featureAvailability: FeatureAvailabilityService,
  ) {}

  /** Shared by create()/update() — see currency-gate.ts's own comment. */
  private async assertCurrencyAllowed(
    db: Kysely<TenantDatabase>,
    schema: string,
    lineCurrency: string,
    errorCode: string,
  ): Promise<void> {
    const tenantCurrency = (await this.tenantSettings.get(db)).currencyCode;
    const multiCurrencyEnabled = await this.featureAvailability.isEnabled(db, schema, FEATURE_KEYS.MULTI_CURRENCY);
    try {
      assertCurrencyAllowedForTenant(lineCurrency, tenantCurrency, multiCurrencyEnabled);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: errorCode, params: { currency: lineCurrency, tenantCurrency } });
    }
  }

  list(db: Kysely<TenantDatabase>): Promise<PurchaseOrder[]> {
    return this.orders.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrderWithLines> {
    const order = await this.orders.findById(db, id);
    if (!order) throw entityNotFound('PURCHASE_ORDER', id);
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
          { code: 'PURCHASE_ORDER.AMBIGUOUS_SOURCE' },
        );
      }
      const quotation = await this.quotations.findById(db, input.sourceQuotationId);
      if (!quotation) throw entityNotFound('SUPPLIER_QUOTATION', input.sourceQuotationId);
      if (quotation.status !== 'selected') {
        throw new BusinessRuleError(
          `Supplier quotation "${input.sourceQuotationId}" is "${quotation.status}", not "selected" — ` +
            'a purchase order can only be raised from a selected quotation.',
          {
            code: 'PURCHASE_ORDER.SOURCE_QUOTATION_NOT_SELECTED',
            params: { id: input.sourceQuotationId, status: quotation.status },
          },
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
        { code: 'PURCHASE_ORDER.MISSING_SOURCE' },
      );
    }
    const supplier = await this.suppliers.findById(db, input.supplierId);
    if (!supplier) throw entityNotFound('SUPPLIER', input.supplierId);
    return { supplierId: input.supplierId, lines: input.lines };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreatePurchaseOrderInput,
    schema: string,
  ): Promise<PurchaseOrderWithLines> {
    const { supplierId, lines } = await this.resolveSupplierAndLines(db, input);
    try {
      assertSingleCurrency(lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, {
        code: 'PURCHASE_ORDER.MULTIPLE_CURRENCIES',
        params: { reason: message },
      });
    }
    await this.assertCurrencyAllowed(
      db,
      schema,
      lines[0]!.unitPrice.currency,
      'PURCHASE_ORDER.MULTI_CURRENCY_DISABLED',
    );

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(db, 'purchase_order', null);
    } catch {
      throw new BusinessRuleError(
        'No numbering sequence configured for purchase orders yet. ' +
          'Create one for document type "purchase_order" via Settings → Numbering Sequences first.',
        { code: 'PURCHASE_ORDER.NO_NUMBERING_SEQUENCE' },
      );
    }

    // withTransaction: PurchaseInvoicesService's direct-invoicing path calls
    // this with its own open trx (Kysely throws on Transaction.transaction()).
    return withTransaction(db, async (trx) => {
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
    schema: string,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_ORDER', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`Purchase order "${id}" is "${existing.status}" and can no longer be edited.`, {
        code: 'PURCHASE_ORDER.NOT_EDITABLE',
        params: { id, status: existing.status },
      });
    }
    if (input.lines !== undefined) {
      if (input.lines.length === 0) {
        throw new BusinessRuleError('A purchase order must have at least one line.', {
          code: 'PURCHASE_ORDER.AT_LEAST_ONE_LINE_REQUIRED',
        });
      }
      try {
        assertSingleCurrency(input.lines);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BusinessRuleError(message, {
          code: 'PURCHASE_ORDER.MULTIPLE_CURRENCIES',
          params: { reason: message },
        });
      }
      await this.assertCurrencyAllowed(
        db,
        schema,
        input.lines[0]!.unitPrice.currency,
        'PURCHASE_ORDER.MULTI_CURRENCY_DISABLED',
      );
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.orders.update(trx, id, {
        expectedDeliveryDate: input.expectedDeliveryDate,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw entityNotFound('PURCHASE_ORDER', id);

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
    if (!existing) throw entityNotFound('PURCHASE_ORDER', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move purchase order "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'PURCHASE_ORDER.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.orders.updateStatus(db, id, to);
    if (!updated) throw entityNotFound('PURCHASE_ORDER', id);
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
    if (!existing) throw entityNotFound('PURCHASE_ORDER', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase order "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'PURCHASE_ORDER.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.orders.delete(db, id);
  }
}
