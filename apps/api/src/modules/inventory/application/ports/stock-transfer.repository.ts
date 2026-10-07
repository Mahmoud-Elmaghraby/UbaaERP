import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  DispatchedPiece,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  TransferLotRequest,
} from '../../domain/stock-transfer.entity';

export interface StockTransferLineRow {
  productVariantId: string;
  quantity: number;
  unitOfMeasureId: string | null;
  unitFactor: number;
  lots: TransferLotRequest[];
  notes: string | null;
}

export interface StockTransferListFilter {
  status?: StockTransferStatus;
  warehouseId?: string;
}

export interface StockTransferRepository {
  list(db: Kysely<TenantDatabase>, filter: StockTransferListFilter): Promise<StockTransfer[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<StockTransfer | null>;
  /** Row-locks the transfer for the rest of the transaction (no double dispatch / receipt). */
  lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  create(
    db: Kysely<TenantDatabase>,
    input: {
      transferNumber: string;
      fromWarehouseId: string;
      fromLocationId: string;
      toWarehouseId: string;
      toLocationId: string;
      transferDate: string | null;
      notes: string | null;
      createdBy: string | null;
    },
  ): Promise<StockTransfer>;
  updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<{
      fromWarehouseId: string;
      fromLocationId: string;
      toWarehouseId: string;
      toLocationId: string;
      transferDate: string;
      notes: string | null;
    }>,
  ): Promise<StockTransfer | null>;
  setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockTransferStatus,
    actor: { userId: string | null; step: 'dispatched' | 'received' | 'cancelled' },
  ): Promise<StockTransfer | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  listLines(db: Kysely<TenantDatabase>, transferId: string): Promise<StockTransferLine[]>;
  replaceLines(db: Kysely<TenantDatabase>, transferId: string, lines: StockTransferLineRow[]): Promise<void>;
  setDispatched(
    db: Kysely<TenantDatabase>,
    lineId: string,
    pieces: DispatchedPiece[],
    value: { amountMinorUnits: string; currency: string } | null,
  ): Promise<void>;
  setReceivedQuantity(db: Kysely<TenantDatabase>, lineId: string, quantity: number): Promise<void>;
  /** Value of every dispatched-but-not-received transfer line, per destination warehouse. */
  inTransitValue(
    db: Kysely<TenantDatabase>,
  ): Promise<{ toWarehouseId: string; currency: string; valueMinorUnits: string; transfers: number }[]>;
}

export const STOCK_TRANSFER_REPOSITORY = Symbol('STOCK_TRANSFER_REPOSITORY');
