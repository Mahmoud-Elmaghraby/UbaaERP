import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PaymentAllocation } from '../../domain/payment-received.entity';

export interface CreatePaymentAllocationRow {
  salesInvoiceId: string;
  allocatedAmount: Money;
}

export interface PaymentAllocationRepository {
  listByPaymentReceivedId(
    db: Kysely<TenantDatabase>,
    paymentReceivedId: string,
  ): Promise<PaymentAllocation[]>;
  create(
    db: Kysely<TenantDatabase>,
    paymentReceivedId: string,
    input: CreatePaymentAllocationRow,
  ): Promise<PaymentAllocation>;
  /**
   * Sums allocated_amount across every allocation belonging to a
   * *posted* payment, for each given sales_invoice_id, keyed by invoice
   * id — draft/cancelled payments never count. Same shape as
   * SalesInvoiceLineRepository.sumInvoicedQuantityBySalesOrderLineIds,
   * but summed as Money (grouped by currency too, since the sum has to
   * carry a currency) rather than a plain number.
   */
  sumAllocatedAmountBySalesInvoiceIds(
    db: Kysely<TenantDatabase>,
    salesInvoiceIds: string[],
  ): Promise<Record<string, Money>>;
}

export const PAYMENT_ALLOCATION_REPOSITORY = Symbol('PAYMENT_ALLOCATION_REPOSITORY');
