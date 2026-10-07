import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { GoodsReceiptWithLinesDto, MoneyDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { usePurchaseOrder } from '../../api/purchase-orders/queries';
import { useGoodsReceiptsByPurchaseOrder } from '../../api/goods-receipts/queries';

export interface RemainingPoLine {
  purchaseOrderLineId: string;
  productVariantId: string;
  /** Unit of the source line (quantities here are in it); null = base unit. */
  unitOfMeasureId: string | null;
  ordered: number;
  received: number;
  remaining: number;
  unitPrice: MoneyDto;
}

/**
 * A goods receipt is recorded against specific purchase order lines, and the backend
 * caps quantityReceived at (ordered - already received across every *confirmed* receipt
 * on that line) — see GoodsReceiptsService.create(). Neither figure is exposed by any
 * single endpoint, so this hook derives it client-side: the PO's own lines (ordered
 * quantities) plus every confirmed goods receipt already recorded against this PO
 * (fanned out via useQueries, same "composed bulk-lookup" pattern as
 * use-eligible-quotations.ts, since the list endpoint doesn't include lines).
 *
 * This is a client-side convenience only (to build the receiving worksheet and cap the
 * inputs) — the backend re-validates the same constraint independently on submit.
 */
export function usePurchaseOrderRemaining(purchaseOrderId: string | null | undefined) {
  const { data: order, isLoading: orderLoading } = usePurchaseOrder(purchaseOrderId);
  const { data: receipts, isLoading: receiptsLoading } = useGoodsReceiptsByPurchaseOrder(purchaseOrderId);

  const confirmedReceiptIds = useMemo(
    () => (receipts ?? []).filter((r) => r.status === 'confirmed').map((r) => r.id),
    [receipts],
  );

  const receiptDetailQueries = useQueries({
    queries: confirmedReceiptIds.map((id) => ({
      queryKey: ['goods-receipts', id],
      queryFn: () => apiGet<GoodsReceiptWithLinesDto>(`/goods-receipts/${id}`),
    })),
  });

  const isLoading = orderLoading || receiptsLoading || receiptDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<RemainingPoLine[]>(() => {
    const receivedByLine = new Map<string, number>();
    for (const query of receiptDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        receivedByLine.set(
          line.purchaseOrderLineId,
          (receivedByLine.get(line.purchaseOrderLineId) ?? 0) + line.quantityReceived,
        );
      }
    }
    return (order?.lines ?? []).map((line) => {
      const received = receivedByLine.get(line.id) ?? 0;
      return {
        purchaseOrderLineId: line.id,
        productVariantId: line.productVariantId,
        unitOfMeasureId: line.unitOfMeasureId ?? null,
        ordered: line.quantity,
        received,
        remaining: line.quantity - received,
        unitPrice: line.unitPrice,
      };
    });
  }, [order, receiptDetailQueries]);

  return { lines, isLoading };
}
