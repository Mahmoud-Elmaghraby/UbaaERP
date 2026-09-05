import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { QuotationLine, CreateQuotationLineInput } from '../../domain/quotation.entity';

export interface QuotationLineRepository {
  listByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<QuotationLine[]>;
  create(db: Kysely<TenantDatabase>, quotationId: string, input: CreateQuotationLineInput): Promise<QuotationLine>;
  deleteByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<void>;
}

export const QUOTATION_LINE_REPOSITORY = Symbol('QUOTATION_LINE_REPOSITORY');
