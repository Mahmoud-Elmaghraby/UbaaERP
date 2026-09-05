import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { MoneyDto, SalesInvoiceWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useSalesInvoicesBySalesOrder } from '../../api/sales-invoices/queries';

export interface InvoiceableSoLine {
  salesOrderLineId: string;
  productVariantId: string;
  ordered: number;
  invoiced: number;
  remaining: number;
  unitPrice: MoneyDto;
}

/**
 * A sales invoice is recorded against specific sales order lines, and the backend caps
 * quantityInvoiced at (ordered - already invoiced across every *posted* invoice on that
 * line) — see SalesInvoicesService.create(). Neither figure is exposed by a single
 * endpoint, so this hook derives it client-side: the sales order's own lines (ordered
 * quantities) plus every posted invoice already recorded against it (fanned out via
 * useQueries, same "composed bulk-lookup" pattern as Purchases'
 * hooks/purchase-invoices/use-purchase-order-invoiceable.ts).
 *
 * This is a client-side convenience only — the backend re-validates the same constraint
 * independently on submit.
 */
export function useSalesOrderInvoiceable(salesOrderId: string | null | undefined) {
  const { data: order, isLoading: orderLoading } = useSalesOrder(salesOrderId);
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoicesBySalesOrder(salesOrderId);

  const postedInvoiceIds = useMemo(
    () => (invoices ?? []).filter((inv) => inv.status === 'posted').map((inv) => inv.id),
    [invoices],
  );

  const invoiceDetailQueries = useQueries({
    queries: postedInvoiceIds.map((id) => ({
      queryKey: ['sales-invoices', id],
      queryFn: () => apiGet<SalesInvoiceWithLinesDto>(`/sales-invoices/${id}`),
    })),
  });

  const isLoading = orderLoading || invoicesLoading || invoiceDetailQueries.some((q) => q.isLoading);

  const lines = useMemo<InvoiceableSoLine[]>(() => {
    const invoicedByLine = new Map<string, number>();
    for (const query of invoiceDetailQueries) {
      for (const line of query.data?.lines ?? []) {
        invoicedByLine.set(
          line.salesOrderLineId,
          (invoicedByLine.get(line.salesOrderLineId) ?? 0) + line.quantityInvoiced,
        );
      }
    }
    return (order?.lines ?? []).map((line) => {
      const invoiced = invoicedByLine.get(line.id) ?? 0;
      return {
        salesOrderLineId: line.id,
        productVariantId: line.productVariantId,
        ordered: line.quantity,
        invoiced,
        remaining: line.quantity - invoiced,
        unitPrice: line.unitPrice,
      };
    });
  }, [order, invoiceDetailQueries]);

  return { lines, isLoading };
}
