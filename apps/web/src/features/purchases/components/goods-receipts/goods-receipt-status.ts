import type { BadgeProps } from '@erp-platform/ui';
import type { GoodsReceiptStatusDto } from '@erp-platform/contracts';

export const GOODS_RECEIPT_STATUS_VARIANT: Record<
  GoodsReceiptStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  confirmed: 'info',
  cancelled: 'danger',
};

export function goodsReceiptStatusLabelKey(status: GoodsReceiptStatusDto): string {
  return `purchases.goodsReceipts.status.${status}`;
}
