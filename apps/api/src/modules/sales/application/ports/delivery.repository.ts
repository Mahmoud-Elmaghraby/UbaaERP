import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Delivery, DeliveryStatus } from '../../domain/delivery.entity';

export interface CreateDeliveryRow {
  deliveryNumber: string;
  salesOrderId: string;
  warehouseId: string;
  deliveryDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface DeliveryRepository {
  list(db: Kysely<TenantDatabase>): Promise<Delivery[]>;
  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<Delivery[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Delivery | null>;
  create(db: Kysely<TenantDatabase>, input: CreateDeliveryRow): Promise<Delivery>;
  updateStatus(db: Kysely<TenantDatabase>, id: string, status: DeliveryStatus): Promise<Delivery | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
