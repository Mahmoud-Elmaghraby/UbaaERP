/** Direct (non-transfer) movement types the "Record Movement" dialog can create. */
export type DirectMovementType = 'in' | 'out' | 'adjustment_increase' | 'adjustment_decrease';

export function movementTypeLabel(t: (key: string) => string, type: string): string {
  const keyByType: Record<string, string> = {
    in: 'inventory.stock.movementIn',
    out: 'inventory.stock.movementOut',
    transfer_in: 'inventory.stock.movementTransferIn',
    transfer_out: 'inventory.stock.movementTransferOut',
    adjustment_increase: 'inventory.stock.movementAdjustmentIncrease',
    adjustment_decrease: 'inventory.stock.movementAdjustmentDecrease',
  };
  return t(keyByType[type] ?? type);
}
