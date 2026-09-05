import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseRequisitionLine,
  CreatePurchaseRequisitionLineInput,
} from '../../domain/purchase-requisition.entity';

export interface PurchaseRequisitionLineRepository {
  listByRequisitionId(db: Kysely<TenantDatabase>, requisitionId: string): Promise<PurchaseRequisitionLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    requisitionId: string,
    input: CreatePurchaseRequisitionLineInput,
  ): Promise<PurchaseRequisitionLine>;
  /** Deletes every line belonging to a requisition — used by replaceLines() before re-inserting. */
  deleteByRequisitionId(db: Kysely<TenantDatabase>, requisitionId: string): Promise<void>;
}

export const PURCHASE_REQUISITION_LINE_REPOSITORY = Symbol('PURCHASE_REQUISITION_LINE_REPOSITORY');
