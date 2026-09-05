import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SupplierQuotationLine,
  CreateSupplierQuotationLineInput,
} from '../../domain/supplier-quotation.entity';

export interface SupplierQuotationLineRepository {
  listByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<SupplierQuotationLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    quotationId: string,
    input: CreateSupplierQuotationLineInput,
  ): Promise<SupplierQuotationLine>;
  deleteByQuotationId(db: Kysely<TenantDatabase>, quotationId: string): Promise<void>;
}

export const SUPPLIER_QUOTATION_LINE_REPOSITORY = Symbol('SUPPLIER_QUOTATION_LINE_REPOSITORY');
