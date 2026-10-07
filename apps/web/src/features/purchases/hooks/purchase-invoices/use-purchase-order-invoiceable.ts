import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { MoneyDto, PurchaseInvoiceWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { usePurchaseOrder } from '../../api/purchase-orders/queries';
import { usePurchaseInvoicesByPurchaseOrder } from '../../api/purchase-invoices/queries';

export interface InvoiceablePoLine {
  purchaseOrderLineId: string;
  productVariantId: string;
  /** Unit of the source line (quantities here are in it); null = base unit. */
  unitOfMeasureId: string | null;
  ordered: number;
  invoiced: number;
  remaining: number;
  unitPrice: MoneyDto;
}

/**
 * A purchase invoice is recorded against specific purchase order lines, and the backend
 * caps quantityInvoiced at (ordered - already invoiced across every *posted* invoice on
 * that line) — see PurchaseInvoicesService.create(), and
 * sumInvoicedQuantityByPurchaseOrderLineIds only counting 'posted' invoices (confirmed by
 * reading the repository method directly, same as every prior "remaining/returnable"
 * hook in this module). Neither figure is exposed by a single endpoint, so this hook
 * derives it client-side: the PO's own lines (ordered quantities) plus every posted
 * invoice already recorded against this PO (fanned out via useQueries, same "composed
 * bulk-lookup" pattern as use-purchase-order-remaining.ts / use-goods-receipt-returnable.ts).
 *
 * This is a client-side convenience only — the backend re-validates the same constraint
 * independently on submit.
 */
export function usePurchaseOrderInvoiceable(purchaseOrderId: string | null | undefined) {
  const { data: order, isLoading: orderLoading } = usePurchaseOrder(purchaseOrderId);
  const { data: invoices, isLoading: invoicesLoading } = usePurchaseInvoicesByPurchaseOrder(purchaseOrderId);

  const postedInvoiceIds = useMemo(
    () => (invoices ?? []).filter((inv) => inv.status === 'posted').map((inv) => inv.id),
    [invoices],
  );

  const invoiceDetailQueries = useQueries({
    queries: postedInvoiceIds.map((id) => ({
      queryKey: ['purchase-invoices', id],
      queryFn: () => apiGet<PurchaseInvoiceWithLinesDto>(`/purchase-invoices/${id}`),
    })),
  });

  const isLoading = orderLoading || invoicesLoading || invoiceDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<InvoiceablePoLine[]>(() => {
    const invoicedByLine = new Map<string, number>();
    for (const query of invoiceDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        invoicedByLine.set(
          line.purchaseOrderLineId,
          (invoicedByLine.get(line.purchaseOrderLineId) ?? 0) + line.quantityInvoiced,
        );
      }
    }
    return (order?.lines ?? []).map((line) => {
      const invoiced = invoicedByLine.get(line.id) ?? 0;
      return {
        purchaseOrderLineId: line.id,
        productVariantId: line.productVariantId,
        unitOfMeasureId: line.unitOfMeasureId ?? null,
        ordered: line.quantity,
        invoiced,
        remaining: line.quantity - invoiced,
        unitPrice: line.unitPrice,
      };
    });
  }, [order, invoiceDetailQueries]);

  return { lines, isLoading };
}
