import { Inject, Injectable } from '@nestjs/common';
import type { Money } from '@erp-platform/shared-kernel';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
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
import { BusinessRuleError } from '../errors';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { localIsoDate } from '../../../../shared/time/local-date';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { assertCurrencyAllowedForTenant } from '../../../../shared/plans/currency-gate';
import { ProductUnitResolver } from '../../../../shared/catalog/product-unit-resolver';
import { resolveSalesRepId } from './sales-reps.service';
import { CustomerCreditService } from './customer-credit.service';
import { SalesLimitsService } from './sales-limits.service';
import type { SalesLimitsCheckDto } from '@erp-platform/contracts';

@Injectable()
export class SalesOrdersService {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly lines: SalesOrderLineRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(QUOTATION_LINE_REPOSITORY) private readonly quotationLines: QuotationLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly featureAvailability: FeatureAvailabilityService,
    private readonly unitResolver: ProductUnitResolver,
    private readonly customerCredit: CustomerCreditService,
    private readonly limits: SalesLimitsService,
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

  list(db: Kysely<TenantDatabase>): Promise<SalesOrder[]> {
    return this.orders.list(db);
  }

  /** The list plus each order's total (both discount levels) — all lines read in one query. */
  async listWithTotals(db: Kysely<TenantDatabase>): Promise<(SalesOrder & { totalAmount: Money | null })[]> {
    const orders = await this.orders.list(db);
    const lines = await this.lines.listBySalesOrderIds(db, orders.map((o) => o.id));
    const byOrder = new Map<string, typeof lines>();
    for (const line of lines) {
      const bucket = byOrder.get(line.salesOrderId);
      if (bucket) bucket.push(line);
      else byOrder.set(line.salesOrderId, [line]);
    }
    return orders.map((order) => {
      const own = byOrder.get(order.id);
      return { ...order, totalAmount: own?.length ? calculateSalesOrderTotal(order, own).totalAmount : null };
    });
  }

  /** What the sales limits say about this order before it is confirmed. */
  async limitsCheck(db: Kysely<TenantDatabase>, id: string, schema: string, permissions: readonly string[]): Promise<SalesLimitsCheckDto> {
    const order = await this.orders.findById(db, id);
    if (!order) throw entityNotFound('SALES_ORDER', id);
    const lines = await this.lines.listBySalesOrderId(db, id);
    return this.limits.check(db, { ...order, lines, schema }, permissions);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrderWithLines> {
    const order = await this.orders.findById(db, id);
    if (!order) throw entityNotFound('SALES_ORDER', id);
    const lines = await this.lines.listBySalesOrderId(db, id);
    const { subtotalAmount, totalAmount } = calculateSalesOrderTotal(order, lines);
    return { ...order, lines, subtotalAmount, totalAmount };
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
          { code: 'SALES_ORDER.AMBIGUOUS_SOURCE' },
        );
      }
      const quotation = await this.quotations.findById(db, input.sourceQuotationId);
      if (!quotation) throw entityNotFound('QUOTATION', input.sourceQuotationId);
      if (quotation.status !== 'accepted') {
        throw new BusinessRuleError(
          `Quotation "${input.sourceQuotationId}" is "${quotation.status}", not "accepted" — ` +
            'a sales order can only be raised from an accepted quotation.',
          {
            code: 'SALES_ORDER.SOURCE_QUOTATION_NOT_ACCEPTED',
            params: { id: input.sourceQuotationId, status: quotation.status },
          },
        );
      }
      if (quotation.validUntilDate && quotation.validUntilDate.slice(0, 10) < localIsoDate()) {
        throw new BusinessRuleError(`Quotation "${quotation.id}" expired on ${quotation.validUntilDate}.`, {
          code: 'SALES_ORDER.QUOTATION_EXPIRED',
          params: { id: quotation.id, validUntil: quotation.validUntilDate.slice(0, 10) },
        });
      }
      // One quotation → one live order (cancel the order to raise a new one).
      const existingOrder = await db
        .selectFrom('sales_orders')
        .select('so_number')
        .where('source_quotation_id', '=', quotation.id)
        .where('status', '!=', 'cancelled')
        .executeTakeFirst();
      if (existingOrder) {
        throw new BusinessRuleError(`Quotation "${quotation.id}" was already turned into sales order "${existingOrder.so_number}".`, {
          code: 'SALES_ORDER.QUOTATION_ALREADY_CONVERTED',
          params: { id: quotation.id, orderNumber: existingOrder.so_number },
        });
      }
      const quotationLines = await this.quotationLines.listByQuotationId(db, quotation.id);
      return {
        customerId: quotation.customerId,
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

    if (!input.customerId || !input.lines || input.lines.length === 0) {
      throw new BusinessRuleError(
        'Provide a sourceQuotationId, or a customerId with at least one line, to create a sales order.',
        { code: 'SALES_ORDER.MISSING_SOURCE' },
      );
    }
    const customer = await this.customers.findById(db, input.customerId);
    if (!customer) throw entityNotFound('CUSTOMER', input.customerId);
    return { customerId: input.customerId, lines: input.lines };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateSalesOrderInput,
    schema: string,
  ): Promise<SalesOrderWithLines> {
    const resolved = await this.resolveCustomerAndLines(db, input);
    const customerId = resolved.customerId;
    const lines = await this.unitResolver.resolve(db, resolved.lines);
    try {
      assertSingleCurrency(lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: 'SALES_ORDER.MULTIPLE_CURRENCIES', params: { reason: message } });
    }
    await this.assertCurrencyAllowed(db, schema, lines[0]!.unitPrice.currency, 'SALES_ORDER.MULTI_CURRENCY_DISABLED');

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(db, 'sales_order', null);
    } catch {
      throw new BusinessRuleError(
        'No numbering sequence configured for sales orders yet. ' +
          'Create one for document type "sales_order" via Settings → Numbering Sequences first.',
        { code: 'SALES_ORDER.NO_NUMBERING_SEQUENCE' },
      );
    }

    // Validate the discount inputs (percentage range, fixed-not-exceeding-gross,
    // consistent discount currency) up front, against the ungenerated total —
    // same "fail before writing anything" discipline as assertSingleCurrency
    // above. Real ids aren't known yet, but calculateSalesOrderTotal() only
    // needs amounts/discounts, so this is safe to run before the transaction.
    try {
      calculateSalesOrderTotal(input, lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: 'SALES_ORDER.INVALID_DISCOUNT', params: { reason: message } });
    }

    // Rep: as given, else the customer's default (migration 0110).
    const customerRep = await db.selectFrom('customers').select('sales_rep_id').where('id', '=', customerId).executeTakeFirst();
    const salesRepId = await resolveSalesRepId(db, input.salesRepId, customerRep?.sales_rep_id ?? null);

    return withTransaction(db, async (trx) => {
      const order = await this.orders.create(trx, {
        soNumber: allocated.formatted,
        customerId,
        sourceQuotationId: input.sourceQuotationId ?? null,
        currency: lines[0].unitPrice.currency,
        discountType: input.discountType ?? null,
        discountPercentage: input.discountPercentage ?? null,
        discountFixedAmount: input.discountFixedAmount ?? null,
        salesRepId,
        notes: input.notes ?? null,
        customFields: input.customFields ?? {},
      });

      const createdLines = [];
      for (const line of lines) {
        createdLines.push(await this.lines.create(trx, order.id, line));
      }

      const { subtotalAmount, totalAmount } = calculateSalesOrderTotal(order, createdLines);
      return { ...order, lines: createdLines, subtotalAmount, totalAmount };
    });
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateSalesOrderInput,
    schema: string,
  ): Promise<SalesOrderWithLines> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw entityNotFound('SALES_ORDER', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(`Sales order "${id}" is "${existing.status}" and can no longer be edited.`, {
        code: 'SALES_ORDER.NOT_EDITABLE',
        params: { id, status: existing.status },
      });
    }
    if (input.lines !== undefined) {
      if (input.lines.length === 0) {
        throw new BusinessRuleError('A sales order must have at least one line.', {
          code: 'SALES_ORDER.AT_LEAST_ONE_LINE_REQUIRED',
        });
      }
      try {
        assertSingleCurrency(input.lines);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BusinessRuleError(message, { code: 'SALES_ORDER.MULTIPLE_CURRENCIES', params: { reason: message } });
      }
      await this.assertCurrencyAllowed(
        db,
        schema,
        input.lines[0]!.unitPrice.currency,
        'SALES_ORDER.MULTI_CURRENCY_DISABLED',
      );
    }

    const newLines = input.lines !== undefined ? await this.unitResolver.resolve(db, input.lines) : undefined;
    const salesRepId =
      input.salesRepId === undefined || input.salesRepId === existing.salesRepId
        ? undefined
        : await resolveSalesRepId(db, input.salesRepId, null);
    return withTransaction(db, async (trx) => {
      const updated = await this.orders.update(trx, id, {
        notes: input.notes,
        customFields: input.customFields,
        discountType: input.discountType,
        discountPercentage: input.discountPercentage,
        discountFixedAmount: input.discountFixedAmount,
        salesRepId,
      });
      if (!updated) throw entityNotFound('SALES_ORDER', id);

      let lines = await this.lines.listBySalesOrderId(trx, id);
      if (newLines !== undefined) {
        await this.lines.deleteBySalesOrderId(trx, id);
        lines = [];
        for (const line of newLines) lines.push(await this.lines.create(trx, id, line));
      }

      const totals = (() => {
        try {
          return calculateSalesOrderTotal(updated, lines);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new BusinessRuleError(message, { code: 'SALES_ORDER.INVALID_DISCOUNT', params: { reason: message } });
        }
      })();

      return { ...updated, lines, subtotalAmount: totals.subtotalAmount, totalAmount: totals.totalAmount };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: SalesOrderStatus[],
    to: SalesOrderStatus,
  ): Promise<SalesOrder> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw entityNotFound('SALES_ORDER', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move sales order "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'SALES_ORDER.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.orders.updateStatus(db, id, to, from);
    if (!updated) throw statusChanged('SALES_ORDER', id);
    return updated;
  }

  /**
   * `creditCheck` is passed by the controller only (a user confirming): the
   * customer's credit limit is enforced then (migration 0109). POS and the
   * automatic order behind a direct invoice confirm without it.
   */
  async confirm(
    db: Kysely<TenantDatabase>,
    id: string,
    creditCheck?: { canOverride: boolean },
    /** Passed by the controller only: the settings hub's sales limits (SalesLimitsService). */
    limits?: { schema: string; permissions: readonly string[] },
  ): Promise<SalesOrder> {
    if (creditCheck || limits) {
      const order = await this.orders.findById(db, id);
      const lines = order?.status === 'draft' ? await this.lines.listBySalesOrderId(db, id) : [];
      if (order && lines.length > 0) {
        if (limits) await this.limits.assert(db, { ...order, lines, schema: limits.schema }, limits.permissions);
        if (creditCheck) {
          const { totalAmount } = calculateSalesOrderTotal(order, lines);
          await this.customerCredit.assertWithinLimit(db, order.customerId, totalAmount, creditCheck.canOverride);
        }
      }
    }
    return this.transitionStatus(db, id, ['draft'], 'confirmed');
  }

  /**
   * Only an order nothing was delivered or invoiced against (cancel those
   * drafts first): a delivery confirmed later would otherwise ship goods for
   * a cancelled order and revive it.
   */
  cancel(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrder> {
    return withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'sales_orders', [id]);
      const [delivery, invoice] = await Promise.all([
        trx.selectFrom('deliveries').select('delivery_number as number').where('sales_order_id', '=', id).where('status', '!=', 'cancelled').executeTakeFirst(),
        trx.selectFrom('sales_invoices').select('invoice_number as number').where('sales_order_id', '=', id).where('status', '!=', 'cancelled').executeTakeFirst(),
      ]);
      const blocker = delivery ?? invoice;
      if (blocker) {
        throw new BusinessRuleError(`Sales order "${id}" has document "${blocker.number}" — cancel it first.`, {
          code: 'SALES_ORDER.HAS_DOCUMENTS',
          params: { id, documentNumber: blocker.number },
        });
      }
      return this.transitionStatus(trx, id, ['draft', 'confirmed'], 'cancelled');
    });
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.orders.findById(db, id);
    if (!existing) throw entityNotFound('SALES_ORDER', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Sales order "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'SALES_ORDER.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.orders.delete(db, id);
  }
}
