import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PaymentReceived,
  PaymentReceivedStatus,
  PaymentMethod,
} from '../../domain/payment-received.entity';

export interface CreatePaymentReceivedRow {
  paymentNumber: string;
  customerId: string;
  paymentDate: string | null;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  amount: Money;
  notes: string | null;
  customFields: Record<string, unknown>;
  posSessionId: string | null;
  treasuryId: string | null;
  cheque?: { number: string; bank?: string | null; dueDate: string } | null;
}

export interface PaymentReceivedRepository {
  list(db: Kysely<TenantDatabase>): Promise<PaymentReceived[]>;
  listByCustomerId(db: Kysely<TenantDatabase>, customerId: string): Promise<PaymentReceived[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PaymentReceived | null>;
  create(db: Kysely<TenantDatabase>, input: CreatePaymentReceivedRow): Promise<PaymentReceived>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PaymentReceivedStatus,
    /** Only when the row is still in (one of) this status — a concurrent change makes it return null. */
    expectedStatus?: PaymentReceivedStatus | PaymentReceivedStatus[],
  ): Promise<PaymentReceived | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PAYMENT_RECEIVED_REPOSITORY = Symbol('PAYMENT_RECEIVED_REPOSITORY');
