import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RfqLine, CreateRfqLineInput } from '../../domain/rfq.entity';

export interface RfqLineRepository {
  listByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<RfqLine[]>;
  create(db: Kysely<TenantDatabase>, rfqId: string, input: CreateRfqLineInput): Promise<RfqLine>;
  deleteByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<void>;
}

export const RFQ_LINE_REPOSITORY = Symbol('RFQ_LINE_REPOSITORY');
