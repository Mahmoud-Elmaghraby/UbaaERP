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
  type PurchaseOrderLine,
  type PurchaseOrderWithLines,
  type PurchaseOrderStatus,
  type CreatePurchaseOrderInput,
  type CreatePurchaseOrderLineInput,
  type UpdatePurchaseOrderInput,
} from '../../domain/purchase-order.entity';
import { BusinessRuleError, ConflictError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { assertCurrencyAllowedForTenant } from '../../../../shared/plans/currency-gate';
import { ProductUnitResolver } from '../../../../shared/catalog/product-unit-resolver';
import { PurchaseLimitsService, type PurchaseLimitsDocument } from './purchase-limits.service';
import type { PurchaseLimitsCheckDto } from '@erp-platform/contracts';

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
    private readonly unitResolver: ProductUnitResolver,
    private readonly limits: PurchaseLimitsService,
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
          unitOfMeasureId: line.unitOfMeasureId,
          unitFactor: line.unitFactor,
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
    const resolved = await this.resolveSupplierAndLines(db, input);
    const supplierId = resolved.supplierId;
    const lines = await this.unitResolver.resolve(db, resolved.lines);
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

    // withTransaction: PurchaseInvoicesService's direct-invoicing path calls
    // this with its own open trx (Kysely throws on Transaction.transaction()).
    try {
      return await withTransaction(db, async (trx) => {
        if (input.sourceQuotationId) await this.assertQuotationStillOrderable(trx, input.sourceQuotationId);
        // Inside the transaction: a failure below doesn't burn a number.
        const allocated = await this.numberingSequences.allocateNext(trx, 'purchase_order', null);
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
    } catch (err) {
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase orders yet. ' +
            'Create one for document type "purchase_order" via Settings → Numbering Sequences first.',
          { code: 'PURCHASE_ORDER.NO_NUMBERING_SEQUENCE' },
        );
      }
      // purchase_orders_source_quotation_live_unique (migration 0114): a concurrent create won the race.
      if (input.sourceQuotationId && isPostgresUniqueViolation(err)) {
        // A plain db is usable again after its own transaction rolled back; an outer trx is not.
        const winner = db.isTransaction
          ? undefined
          : await db
              .selectFrom('purchase_orders')
              .select('po_number')
              .where('source_quotation_id', '=', input.sourceQuotationId)
              .where('status', '!=', 'cancelled')
              .executeTakeFirst();
        throw new ConflictError(`Supplier quotation "${input.sourceQuotationId}" already has a purchase order.`, {
          code: 'SUPPLIER_QUOTATION.ALREADY_ORDERED',
          params: { id: input.sourceQuotationId, poNumber: winner?.po_number ?? '' },
        });
      }
      throw err;
    }
  }

  /**
   * Under a lock on the quotation: still 'selected', and no live
   * (non-cancelled) purchase order raised from it yet — one quotation, one
   * order (cancel that order to raise a new one).
   */
  private async assertQuotationStillOrderable(trx: Kysely<TenantDatabase>, quotationId: string): Promise<void> {
    await lockRowsForUpdate(trx, 'supplier_quotations', [quotationId]);
    const quotation = await this.quotations.findById(trx, quotationId);
    if (!quotation) throw entityNotFound('SUPPLIER_QUOTATION', quotationId);
    if (quotation.status !== 'selected') {
      throw new BusinessRuleError(
        `Supplier quotation "${quotationId}" is "${quotation.status}", not "selected" — ` +
          'a purchase order can only be raised from a selected quotation.',
        { code: 'PURCHASE_ORDER.SOURCE_QUOTATION_NOT_SELECTED', params: { id: quotationId, status: quotation.status } },
      );
    }
    const existingOrder = await trx
      .selectFrom('purchase_orders')
      .select('po_number')
      .where('source_quotation_id', '=', quotationId)
      .where('status', '!=', 'cancelled')
      .executeTakeFirst();
    if (existingOrder) {
      throw new ConflictError(
        `Supplier quotation "${quotationId}" was already turned into purchase order "${existingOrder.po_number}".`,
        { code: 'SUPPLIER_QUOTATION.ALREADY_ORDERED', params: { id: quotationId, poNumber: existingOrder.po_number } },
      );
    }
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

    const newLines = input.lines !== undefined ? await this.unitResolver.resolve(db, input.lines) : undefined;
    return withTransaction(db, async (trx) => {
      // Re-checked under a lock: it may have been confirmed/cancelled since it was read above.
      await lockRowsForUpdate(trx, 'purchase_orders', [id]);
      const current = await this.orders.findById(trx, id);
      if (!current || current.status !== 'draft') throw statusChanged('PURCHASE_ORDER', id);
      const updated = await this.orders.update(trx, id, {
        expectedDeliveryDate: input.expectedDeliveryDate,
        notes: input.notes,
        customFields: input.customFields,
      });
      if (!updated) throw entityNotFound('PURCHASE_ORDER', id);

      let lines = await this.lines.listByPurchaseOrderId(trx, id);
      if (newLines !== undefined) {
        await this.lines.deleteByPurchaseOrderId(trx, id);
        lines = [];
        for (const line of newLines) lines.push(await this.lines.create(trx, id, line));
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
    const updated = await this.orders.updateStatus(db, id, to, from);
    if (!updated) throw statusChanged('PURCHASE_ORDER', id);
    return updated;
  }

  /**
   * `limits` is passed by the controller only (a user confirming): the settings hub's purchases
   * limits apply then. The automatic order behind a direct invoice is checked when that invoice
   * is posted instead.
   */
  async confirm(db: Kysely<TenantDatabase>, id: string, limits?: { permissions: readonly string[] }): Promise<PurchaseOrder> {
    if (limits) {
      const order = await this.orders.findById(db, id);
      if (order?.status === 'draft') {
        const lines = await this.lines.listByPurchaseOrderId(db, id);
        await this.limits.assert(db, orderLimitsDocument(id, lines), limits.permissions);
      }
    }
    return this.transitionStatus(db, id, ['draft'], 'confirmed');
  }

  /** What the purchases limits say about this order before it is confirmed. */
  async limitsCheck(db: Kysely<TenantDatabase>, id: string, permissions: readonly string[]): Promise<PurchaseLimitsCheckDto> {
    const order = await this.orders.findById(db, id);
    if (!order) throw entityNotFound('PURCHASE_ORDER', id);
    const lines = await this.lines.listByPurchaseOrderId(db, id);
    return this.limits.check(db, orderLimitsDocument(id, lines), permissions);
  }

  /**
   * Only an order nothing was received or invoiced against — not even a
   * draft (cancel those first): a receipt or invoice confirmed later would
   * otherwise bring goods / a bill in for a cancelled order.
   */
  cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrder> {
    return withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'purchase_orders', [id]);
      const blocker = await this.firstLiveDocument(trx, id);
      if (blocker) {
        throw new BusinessRuleError(`Purchase order "${id}" has document "${blocker}" — cancel it first.`, {
          code: 'PURCHASE_ORDER.HAS_DOCUMENTS',
          params: { id, documentNumber: blocker },
        });
      }
      return this.transitionStatus(trx, id, ['draft', 'confirmed'], 'cancelled');
    });
  }

  /** Number of a non-cancelled goods receipt or purchase invoice on this order (posted/confirmed first), or null. */
  async firstLiveDocument(db: Kysely<TenantDatabase>, id: string): Promise<string | null> {
    const [receipt, invoice] = await Promise.all([
      db
        .selectFrom('goods_receipts')
        .select('receipt_number as number')
        .where('purchase_order_id', '=', id)
        .where('status', '!=', 'cancelled')
        .orderBy('status')
        .executeTakeFirst(),
      db
        .selectFrom('purchase_invoices')
        .select('invoice_number as number')
        .where('purchase_order_id', '=', id)
        .where('status', '!=', 'cancelled')
        .orderBy('status', 'desc')
        .executeTakeFirst(),
    ]);
    return receipt?.number ?? invoice?.number ?? null;
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

/** An order's lines for the purchases limits: amount = price × quantity, quantity in base units. */
function orderLimitsDocument(orderId: string, lines: PurchaseOrderLine[]): PurchaseLimitsDocument {
  return {
    purchaseOrderId: orderId,
    checkApproval: true,
    lines: lines.map((line) => ({
      lineId: line.id,
      productVariantId: line.productVariantId,
      netMinor: line.unitPrice.multiplyByQuantity(line.quantity).toMinorUnits(),
      currency: line.unitPrice.currency,
      baseQuantity: line.quantity * (line.unitFactor || 1),
    })),
  };
}
