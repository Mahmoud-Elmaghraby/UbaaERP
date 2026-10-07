import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { SalesReturnWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useDelivery } from '../../api/deliveries/queries';
import { useSalesReturnsByDelivery } from '../../api/sales-returns/queries';

export interface ReturnableDeliveryLine {
  deliveryLineId: string;
  productVariantId: string;
  /** Unit of the source line (quantities here are in it); null = base unit. */
  unitOfMeasureId: string | null;
  delivered: number;
  returned: number;
  remaining: number;
}

/**
 * A sales return is recorded against specific delivery lines, and the backend caps
 * quantityReturned at (delivered - already returned across every *confirmed* return on
 * that line) — see SalesReturnsService.create(), and
 * sumReturnedQuantityByDeliveryLineIds only counting 'confirmed' returns. Neither figure
 * is exposed by a single endpoint, so this hook derives it client-side: the delivery's
 * own lines (delivered quantities) plus every confirmed sales return already recorded
 * against it (fanned out via useQueries, same "composed bulk-lookup" pattern as
 * Purchases' hooks/purchase-returns/use-goods-receipt-returnable.ts).
 *
 * This is a client-side convenience only (to build the returnable worksheet and hint at
 * valid input ranges) — the backend re-validates the same constraint independently.
 */
export function useDeliveryReturnable(deliveryId: string | null | undefined) {
  const { data: delivery, isLoading: deliveryLoading } = useDelivery(deliveryId);
  const { data: returns, isLoading: returnsLoading } = useSalesReturnsByDelivery(deliveryId);

  const confirmedReturnIds = useMemo(
    () => (returns ?? []).filter((r) => r.status === 'confirmed').map((r) => r.id),
    [returns],
  );

  const returnDetailQueries = useQueries({
    queries: confirmedReturnIds.map((id) => ({
      queryKey: ['sales-returns', id],
      queryFn: () => apiGet<SalesReturnWithLinesDto>(`/sales-returns/${id}`),
    })),
  });

  const isLoading = deliveryLoading || returnsLoading || returnDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<ReturnableDeliveryLine[]>(() => {
    const returnedByLine = new Map<string, number>();
    for (const query of returnDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        returnedByLine.set(
          line.deliveryLineId,
          (returnedByLine.get(line.deliveryLineId) ?? 0) + line.quantityReturned,
        );
      }
    }
    return (delivery?.lines ?? []).map((line) => {
      const returned = returnedByLine.get(line.id) ?? 0;
      return {
        deliveryLineId: line.id,
        productVariantId: line.productVariantId,
        unitOfMeasureId: line.unitOfMeasureId ?? null,
        delivered: line.quantityDelivered,
        returned,
        remaining: line.quantityDelivered - returned,
      };
    });
  }, [delivery, returnDetailQueries]);

  return { lines, isLoading };
}
