import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SupplierPaymentAllocation } from '../../domain/supplier-payment.entity';

export interface CreateSupplierPaymentAllocationRow {
  purchaseInvoiceId: string;
  allocatedAmount: Money;
}

export interface SupplierPaymentAllocationRepository {
  listBySupplierPaymentId(
    db: Kysely<TenantDatabase>,
    supplierPaymentId: string,
  ): Promise<SupplierPaymentAllocation[]>;
  create(
    db: Kysely<TenantDatabase>,
    supplierPaymentId: string,
    input: CreateSupplierPaymentAllocationRow,
  ): Promise<SupplierPaymentAllocation>;
  /** Sum of allocations from *posted* supplier payments per purchase invoice id (draft/cancelled never count). */
  sumAllocatedAmountByPurchaseInvoiceIds(
    db: Kysely<TenantDatabase>,
    purchaseInvoiceIds: string[],
  ): Promise<Record<string, Money>>;
}

export const SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY = Symbol('SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY');
