import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { DeliveryWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useDeliveriesBySalesOrder } from '../../api/deliveries/queries';

export interface RemainingSoLine {
  salesOrderLineId: string;
  productVariantId: string;
  /** Unit of the source line (quantities here are in it); null = base unit. */
  unitOfMeasureId: string | null;
  ordered: number;
  delivered: number;
  remaining: number;
}

/**
 * A delivery is recorded against specific sales order lines, and the backend caps
 * quantityDelivered at (ordered - already delivered across every *confirmed* delivery
 * on that line) — see DeliveriesService.create(). Neither figure is exposed by any
 * single endpoint, so this hook derives it client-side: the sales order's own lines
 * (ordered quantities) plus every confirmed delivery already recorded against this
 * order (fanned out via useQueries, same "composed bulk-lookup" pattern as Purchases'
 * hooks/goods-receipts/use-purchase-order-remaining.ts).
 *
 * This is a client-side convenience only (to build the delivering worksheet and cap
 * the inputs) — the backend re-validates the same constraint independently on submit.
 */
export function useSalesOrderRemaining(salesOrderId: string | null | undefined) {
  const { data: order, isLoading: orderLoading } = useSalesOrder(salesOrderId);
  const { data: deliveries, isLoading: deliveriesLoading } = useDeliveriesBySalesOrder(salesOrderId);

  const confirmedDeliveryIds = useMemo(
    () => (deliveries ?? []).filter((d) => d.status === 'confirmed').map((d) => d.id),
    [deliveries],
  );

  const deliveryDetailQueries = useQueries({
    queries: confirmedDeliveryIds.map((id) => ({
      queryKey: ['deliveries', id],
      queryFn: () => apiGet<DeliveryWithLinesDto>(`/deliveries/${id}`),
    })),
  });

  const isLoading = orderLoading || deliveriesLoading || deliveryDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<RemainingSoLine[]>(() => {
    const deliveredByLine = new Map<string, number>();
    for (const query of deliveryDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        deliveredByLine.set(
          line.salesOrderLineId,
          (deliveredByLine.get(line.salesOrderLineId) ?? 0) + line.quantityDelivered,
        );
      }
    }
    return (order?.lines ?? []).map((line) => {
      const delivered = deliveredByLine.get(line.id) ?? 0;
      return {
        salesOrderLineId: line.id,
        productVariantId: line.productVariantId,
        unitOfMeasureId: line.unitOfMeasureId ?? null,
        ordered: line.quantity,
        delivered,
        remaining: line.quantity - delivered,
      };
    });
  }, [order, deliveryDetailQueries]);

  return { lines, isLoading };
}
