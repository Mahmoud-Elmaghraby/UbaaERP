import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Quotation, QuotationStatus } from '../../domain/quotation.entity';

export interface CreateQuotationRow {
  quotationNumber: string;
  customerId: string;
  validUntilDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdateQuotationRow {
  validUntilDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface QuotationRepository {
  list(db: Kysely<TenantDatabase>): Promise<Quotation[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Quotation | null>;
  create(db: Kysely<TenantDatabase>, input: CreateQuotationRow): Promise<Quotation>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateQuotationRow): Promise<Quotation | null>;
  updateStatus(db: Kysely<TenantDatabase>, id: string, status: QuotationStatus): Promise<Quotation | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');
