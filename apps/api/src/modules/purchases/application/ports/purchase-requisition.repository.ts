import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseRequisition,
  PurchaseRequisitionStatus,
} from '../../domain/purchase-requisition.entity';

export interface CreatePurchaseRequisitionRow {
  requisitionNumber: string;
  requestedBy: string;
  branchId: string | null;
  neededByDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdatePurchaseRequisitionRow {
  branchId?: string | null;
  neededByDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface PurchaseRequisitionRepository {
  list(db: Kysely<TenantDatabase>): Promise<PurchaseRequisition[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseRequisition | null>;
  create(db: Kysely<TenantDatabase>, input: CreatePurchaseRequisitionRow): Promise<PurchaseRequisition>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseRequisitionRow,
  ): Promise<PurchaseRequisition | null>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseRequisitionStatus,
  ): Promise<PurchaseRequisition | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PURCHASE_REQUISITION_REPOSITORY = Symbol('PURCHASE_REQUISITION_REPOSITORY');
