import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  AdjustmentDirection,
  StockAdjustment,
  StockAdjustmentLine,
  StockAdjustmentReason,
  StockAdjustmentReasonInput,
  StockAdjustmentStatus,
} from '../../domain/stock-adjustment.entity';

export interface StockAdjustmentLineRow {
  productVariantId: string;
  direction: AdjustmentDirection;
  quantity: number;
  unitOfMeasureId: string | null;
  unitFactor: number;
  unitCost: Money | null;
  lotNumber: string | null;
  expiryDate: string | null;
  reasonId: string | null;
  notes: string | null;
}

export interface StockAdjustmentRepository {
  listReasons(db: Kysely<TenantDatabase>): Promise<StockAdjustmentReason[]>;
  findReason(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustmentReason | null>;
  createReason(db: Kysely<TenantDatabase>, input: StockAdjustmentReasonInput): Promise<StockAdjustmentReason>;
  updateReason(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<StockAdjustmentReasonInput>,
  ): Promise<StockAdjustmentReason | null>;
  deleteReason(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
  reasonInUse(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;

  list(
    db: Kysely<TenantDatabase>,
    filter: { status?: StockAdjustmentStatus; warehouseId?: string },
  ): Promise<StockAdjustment[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustment | null>;
  lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  create(
    db: Kysely<TenantDatabase>,
    input: {
      adjustmentNumber: string;
      warehouseId: string;
      locationId: string;
      reasonId: string | null;
      adjustmentDate: string | null;
      notes: string | null;
      createdBy: string | null;
    },
  ): Promise<StockAdjustment>;
  updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<{
      warehouseId: string;
      locationId: string;
      reasonId: string | null;
      adjustmentDate: string;
      notes: string | null;
    }>,
  ): Promise<void>;
  setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockAdjustmentStatus,
    postedBy?: string | null,
  ): Promise<void>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  listLines(db: Kysely<TenantDatabase>, adjustmentId: string): Promise<StockAdjustmentLine[]>;
  replaceLines(db: Kysely<TenantDatabase>, adjustmentId: string, lines: StockAdjustmentLineRow[]): Promise<void>;
  setPostedValue(db: Kysely<TenantDatabase>, lineId: string, value: Money): Promise<void>;
}

export const STOCK_ADJUSTMENT_REPOSITORY = Symbol('STOCK_ADJUSTMENT_REPOSITORY');
