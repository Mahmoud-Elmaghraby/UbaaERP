import type { Money } from '@erp-platform/shared-kernel';

/** See migration 0083 for the life cycle. */
export type StockTransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled';

export interface StockTransfer {
  id: string;
  transferNumber: string;
  status: StockTransferStatus;
  fromWarehouseId: string;
  fromLocationId: string;
  toWarehouseId: string;
  toLocationId: string;
  transferDate: string;
  notes: string | null;
  createdBy: string | null;
  dispatchedBy: string | null;
  dispatchedAt: Date | null;
  receivedBy: string | null;
  receivedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A lot the user picked on the line (line unit). */
export interface TransferLotRequest {
  lotNumber: string;
  quantity: number;
}

/** What actually left the source for one line, frozen at dispatch (base units). */
export interface DispatchedPiece {
  stockLotId: string | null;
  quantity: number;
  valueMinorUnits: string;
}

export interface StockTransferLine {
  id: string;
  stockTransferId: string;
  lineNumber: number;
  productVariantId: string;
  /** In the line's unit. */
  quantity: number;
  unitOfMeasureId: string | null;
  unitFactor: number;
  lots: TransferLotRequest[];
  dispatched: DispatchedPiece[];
  dispatchedValue: Money | null;
  /** Base units actually received; null until received. */
  receivedQuantity: number | null;
  notes: string | null;
}

export interface StockTransferWithLines extends StockTransfer {
  lines: StockTransferLine[];
}

export interface StockTransferLineInput {
  productVariantId: string;
  quantity: number;
  unitOfMeasureId?: string | null;
  lots?: TransferLotRequest[];
  notes?: string | null;
}

export interface CreateStockTransferInput {
  fromWarehouseId: string;
  fromLocationId?: string | null;
  toWarehouseId: string;
  toLocationId?: string | null;
  transferDate?: string | null;
  notes?: string | null;
  lines: StockTransferLineInput[];
}

export interface ReceiveStockTransferInput {
  /** Per line, BASE-unit quantity actually received. Lines left out are received in full. */
  lines?: { lineId: string; receivedQuantity: number }[];
}

/** Base-unit quantity of a line. */
export function baseQuantity(line: Pick<StockTransferLine, 'quantity' | 'unitFactor'>): number {
  return Math.round(line.quantity * line.unitFactor * 10_000) / 10_000;
}

/**
 * Splits a dispatched line's pieces into what arrives and what is short,
 * taking the shortage from the LAST pieces (the first lots picked arrive
 * first). Values are split proportionally and rounded once per piece, the
 * short part keeping the remainder so arriving + short = dispatched exactly.
 */
export function splitReceipt(
  pieces: readonly DispatchedPiece[],
  receivedQuantity: number,
): { arriving: DispatchedPiece[]; short: DispatchedPiece[] } {
  const arriving: DispatchedPiece[] = [];
  const short: DispatchedPiece[] = [];
  let remaining = receivedQuantity;
  for (const piece of pieces) {
    const take = Math.max(0, Math.min(piece.quantity, Math.round(remaining * 10_000) / 10_000));
    remaining -= take;
    if (take >= piece.quantity) {
      arriving.push(piece);
      continue;
    }
    const value = BigInt(piece.valueMinorUnits);
    const arrivingValue = take > 0 ? proportion(value, take, piece.quantity) : 0n;
    if (take > 0) arriving.push({ ...piece, quantity: take, valueMinorUnits: arrivingValue.toString() });
    short.push({
      ...piece,
      quantity: Math.round((piece.quantity - take) * 10_000) / 10_000,
      valueMinorUnits: (value - arrivingValue).toString(),
    });
  }
  return { arriving, short };
}

/** value × part ÷ whole, rounded half away from zero, in exact integer arithmetic (4 decimal quantities). */
export function proportion(value: bigint, part: number, whole: number): bigint {
  const scaledPart = BigInt(Math.round(part * 10_000));
  const scaledWhole = BigInt(Math.round(whole * 10_000));
  if (scaledWhole === 0n) return 0n;
  const numerator = value * scaledPart * 2n + scaledWhole;
  return numerator / (scaledWhole * 2n);
}
