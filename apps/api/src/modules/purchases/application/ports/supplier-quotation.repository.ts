import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SupplierQuotation, SupplierQuotationStatus } from '../../domain/supplier-quotation.entity';

export interface CreateSupplierQuotationRow {
  rfqId: string;
  supplierId: string;
  validUntil: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdateSupplierQuotationRow {
  validUntil?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface SupplierQuotationRepository {
  list(db: Kysely<TenantDatabase>, rfqId?: string): Promise<SupplierQuotation[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierQuotation | null>;
  /** Sibling quotations under the same RFQ, excluding the given one — used when selecting a winner. */
  listByRfqIdExcluding(
    db: Kysely<TenantDatabase>,
    rfqId: string,
    excludingId: string,
  ): Promise<SupplierQuotation[]>;
  create(db: Kysely<TenantDatabase>, input: CreateSupplierQuotationRow): Promise<SupplierQuotation>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateSupplierQuotationRow,
  ): Promise<SupplierQuotation | null>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SupplierQuotationStatus,
  ): Promise<SupplierQuotation | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SUPPLIER_QUOTATION_REPOSITORY = Symbol('SUPPLIER_QUOTATION_REPOSITORY');
