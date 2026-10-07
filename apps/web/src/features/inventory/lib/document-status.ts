import type { StockAdjustmentStatusDto, StockTransferStatusDto } from '@erp-platform/contracts';

export const TRANSFERS_PATH = '/inventory/transfers';
export const ADJUSTMENTS_PATH = '/inventory/adjustments';

export const TRANSFER_STATUS_VARIANT: Record<StockTransferStatusDto, 'neutral' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  in_transit: 'info',
  received: 'success',
  cancelled: 'danger',
};

export const ADJUSTMENT_STATUS_VARIANT: Record<StockAdjustmentStatusDto, 'neutral' | 'success' | 'danger'> = {
  draft: 'neutral',
  posted: 'success',
  cancelled: 'danger',
};
