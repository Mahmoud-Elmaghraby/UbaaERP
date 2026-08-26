import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface ApprovalChainRepository {
  getManagerId(db: Kysely<TenantDatabase>, userId: string): Promise<string | null>;
  setManager(db: Kysely<TenantDatabase>, userId: string, managerId: string | null): Promise<void>;
}

export const APPROVAL_CHAIN_REPOSITORY = Symbol('APPROVAL_CHAIN_REPOSITORY');
