import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesCreditNote } from '../../domain/sales-credit-note.entity';

export interface CreateSalesCreditNoteRow {
  creditNoteNumber: string;
  salesReturnId: string;
  customerId: string;
  currency: string;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface SalesCreditNoteRepository {
  list(db: Kysely<TenantDatabase>): Promise<SalesCreditNote[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesCreditNote | null>;
  findBySalesReturnId(db: Kysely<TenantDatabase>, salesReturnId: string): Promise<SalesCreditNote | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSalesCreditNoteRow): Promise<SalesCreditNote>;
}

export const SALES_CREDIT_NOTE_REPOSITORY = Symbol('SALES_CREDIT_NOTE_REPOSITORY');
