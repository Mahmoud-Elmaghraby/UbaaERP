import type { FixedAssetDto } from '@erp-platform/contracts';

export const FIXED_ASSET_STATUS_VARIANT: Record<FixedAssetDto['status'], 'success' | 'neutral' | 'warning'> = {
  active: 'success',
  fully_depreciated: 'neutral',
  disposed: 'warning',
};
