import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Rfq, RfqStatus } from '../../domain/rfq.entity';

export interface CreateRfqRow {
  rfqNumber: string;
  sourceRequisitionId: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdateRfqRow {
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface RfqRepository {
  list(db: Kysely<TenantDatabase>): Promise<Rfq[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Rfq | null>;
  create(db: Kysely<TenantDatabase>, input: CreateRfqRow): Promise<Rfq>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateRfqRow): Promise<Rfq | null>;
  updateStatus(db: Kysely<TenantDatabase>, id: string, status: RfqStatus): Promise<Rfq | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const RFQ_REPOSITORY = Symbol('RFQ_REPOSITORY');
