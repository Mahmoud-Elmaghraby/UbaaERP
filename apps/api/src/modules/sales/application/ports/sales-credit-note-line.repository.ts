import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesCreditNoteLine, CreateSalesCreditNoteLineInput } from '../../domain/sales-credit-note.entity';

export interface SalesCreditNoteLineRepository {
  listBySalesCreditNoteId(db: Kysely<TenantDatabase>, salesCreditNoteId: string): Promise<SalesCreditNoteLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    salesCreditNoteId: string,
    input: CreateSalesCreditNoteLineInput,
  ): Promise<SalesCreditNoteLine>;
}

export const SALES_CREDIT_NOTE_LINE_REPOSITORY = Symbol('SALES_CREDIT_NOTE_LINE_REPOSITORY');
