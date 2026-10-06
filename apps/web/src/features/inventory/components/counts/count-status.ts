import type { StockCountStatusDto } from '@erp-platform/contracts';

export const COUNT_STATUS_VARIANT: Record<StockCountStatusDto, 'neutral' | 'success' | 'danger'> = {
  draft: 'neutral',
  posted: 'success',
  cancelled: 'danger',
};

export const COUNTS_PATH = '/inventory/counts';
