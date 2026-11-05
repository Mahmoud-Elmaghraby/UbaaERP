import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SupplierPayment,
  SupplierPaymentStatus,
  SupplierPaymentMethod,
} from '../../domain/supplier-payment.entity';

export interface CreateSupplierPaymentRow {
  paymentNumber: string;
  supplierId: string;
  paymentDate: string | null;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber: string | null;
  amount: Money;
  treasuryId: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  cheque?: { number: string; bank?: string | null; dueDate: string } | null;
  endorsedChequeId?: string | null;
}

export interface SupplierPaymentRepository {
  list(db: Kysely<TenantDatabase>): Promise<SupplierPayment[]>;
  listBySupplierId(db: Kysely<TenantDatabase>, supplierId: string): Promise<SupplierPayment[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierPayment | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSupplierPaymentRow): Promise<SupplierPayment>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SupplierPaymentStatus,
    /** Only when the row is still in this status (a concurrent change returns null). */
    expectedStatus?: SupplierPaymentStatus,
  ): Promise<SupplierPayment | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SUPPLIER_PAYMENT_REPOSITORY = Symbol('SUPPLIER_PAYMENT_REPOSITORY');
