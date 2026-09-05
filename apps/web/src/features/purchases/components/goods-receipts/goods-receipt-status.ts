import type { GoodsReceiptStatusDto } from '@erp-platform/contracts';

export const GOODS_RECEIPT_STATUS_VARIANT: Record<
  GoodsReceiptStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
};

export function goodsReceiptStatusLabelKey(status: GoodsReceiptStatusDto): string {
  return `purchases.goodsReceipts.status.${status}`;
}
