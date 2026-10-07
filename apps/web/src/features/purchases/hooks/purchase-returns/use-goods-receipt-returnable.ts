import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { PurchaseReturnWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useGoodsReceipt } from '../../api/goods-receipts/queries';
import { usePurchaseReturnsByGoodsReceipt } from '../../api/purchase-returns/queries';

export interface ReturnableReceiptLine {
  goodsReceiptLineId: string;
  productVariantId: string;
  /** Unit of the source line (quantities here are in it); null = base unit. */
  unitOfMeasureId: string | null;
  received: number;
  returned: number;
  remaining: number;
}

/**
 * A purchase return is recorded against specific goods receipt lines, and the backend
 * caps quantityReturned at (received - already returned across every *confirmed* return
 * on that line) — see PurchaseReturnsService.create(), and
 * sumReturnedQuantityByGoodsReceiptLineIds only counting 'confirmed' returns. Neither
 * figure is exposed by a single endpoint, so this hook derives it client-side: the goods
 * receipt's own lines (received quantities) plus every confirmed purchase return already
 * recorded against it (fanned out via useQueries, same "composed bulk-lookup" pattern as
 * use-purchase-order-remaining.ts in the Goods Receipts stage).
 *
 * This is a client-side convenience only (to build the returnable worksheet and hint at
 * valid input ranges) — the backend re-validates the same constraint independently.
 */
export function useGoodsReceiptReturnable(goodsReceiptId: string | null | undefined) {
  const { data: receipt, isLoading: receiptLoading } = useGoodsReceipt(goodsReceiptId);
  const { data: returns, isLoading: returnsLoading } = usePurchaseReturnsByGoodsReceipt(goodsReceiptId);

  const confirmedReturnIds = useMemo(
    () => (returns ?? []).filter((r) => r.status === 'confirmed').map((r) => r.id),
    [returns],
  );

  const returnDetailQueries = useQueries({
    queries: confirmedReturnIds.map((id) => ({
      queryKey: ['purchase-returns', id],
      queryFn: () => apiGet<PurchaseReturnWithLinesDto>(`/purchase-returns/${id}`),
    })),
  });

  const isLoading = receiptLoading || returnsLoading || returnDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<ReturnableReceiptLine[]>(() => {
    const returnedByLine = new Map<string, number>();
    for (const query of returnDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        returnedByLine.set(
          line.goodsReceiptLineId,
          (returnedByLine.get(line.goodsReceiptLineId) ?? 0) + line.quantityReturned,
        );
      }
    }
    return (receipt?.lines ?? []).map((line) => {
      const returned = returnedByLine.get(line.id) ?? 0;
      return {
        goodsReceiptLineId: line.id,
        productVariantId: line.productVariantId,
        unitOfMeasureId: line.unitOfMeasureId ?? null,
        received: line.quantityReceived,
        returned,
        remaining: line.quantityReceived - returned,
      };
    });
  }, [receipt, returnDetailQueries]);

  return { lines, isLoading };
}
