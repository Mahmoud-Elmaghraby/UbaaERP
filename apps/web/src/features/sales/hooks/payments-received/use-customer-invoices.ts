import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { SalesInvoiceDto, SalesInvoiceWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useSalesOrders } from '../../api/sales-orders/queries';

export interface CustomerInvoiceOption {
  invoice: SalesInvoiceDto;
  soNumber: string;
  totalAmount: SalesInvoiceWithLinesDto['totalAmount'];
}

/**
 * Payments Received allocate against posted sales invoices, but invoices are only
 * listable scoped to a sales order (?salesOrderId=, see api/sales-invoices/queries.ts)
 * — there's no "invoices by customer" endpoint. This hook derives the candidate list
 * client-side, in two fanned-out stages (same "composed bulk-lookup" pattern as every
 * other cross-reference hook in this module, just one level deeper): the customer's own
 * sales orders (filtered client-side from the unscoped list), then every sales invoice
 * under each of those orders (fanned out via useQueries), filtered to 'posted', then
 * each posted invoice's own detail (a second useQueries fan-out) to read its
 * totalAmount — a list-shaped SalesInvoiceDto doesn't carry it.
 *
 * This does NOT know how much of each invoice is already allocated by other payments —
 * no endpoint exposes that (payment_allocations isn't queried through any list route).
 * The allocation form (payment-received-form.tsx) therefore only caps the *sum entered
 * here* against the payment's own amount/unallocated remainder, which it can enforce
 * client-side; the backend is the sole authority on each invoice's true outstanding
 * balance and re-validates independently (PaymentsReceivedService.validateAllocations())
 * — same "client-side convenience, backend authoritative" shape as every worksheet in
 * this codebase, just without a client-side "remaining" hint on this one screen.
 */
export function useCustomerInvoices(customerId: string | null | undefined) {
  const { data: salesOrders, isLoading: ordersLoading } = useSalesOrders();

  const customerOrderIds = useMemo(
    () => (salesOrders ?? []).filter((so) => so.customerId === customerId).map((so) => so.id),
    [salesOrders, customerId],
  );
  const soNumberById = useMemo(
    () => new Map((salesOrders ?? []).map((so) => [so.id, so.soNumber])),
    [salesOrders],
  );

  const invoiceListQueries = useQueries({
    queries: customerOrderIds.map((soId) => ({
      queryKey: ['sales-invoices', 'by-so', soId],
      queryFn: () => apiGet<SalesInvoiceDto[]>(`/sales-invoices?salesOrderId=${soId}`),
      enabled: Boolean(customerId),
    })),
  });

  const postedInvoices = useMemo(
    () => invoiceListQueries.flatMap((q) => (q.data ?? []).filter((inv) => inv.status === 'posted')),
    [invoiceListQueries],
  );

  const invoiceDetailQueries = useQueries({
    queries: postedInvoices.map((invoice) => ({
      queryKey: ['sales-invoices', invoice.id],
      queryFn: () => apiGet<SalesInvoiceWithLinesDto>(`/sales-invoices/${invoice.id}`),
    })),
  });

  const isLoading =
    ordersLoading ||
    invoiceListQueries.some((q) => q.isLoading) ||
    invoiceDetailQueries.some((q) => q.isLoading);

  const invoiceOptions = useMemo<CustomerInvoiceOption[]>(() => {
    const totalById = new Map(
      invoiceDetailQueries
        .map((q) => q.data)
        .filter((data): data is SalesInvoiceWithLinesDto => Boolean(data))
        .map((data) => [data.id, data.totalAmount]),
    );
    return postedInvoices
      .filter((invoice) => totalById.has(invoice.id))
      .map((invoice) => ({
        invoice,
        soNumber: soNumberById.get(invoice.salesOrderId) ?? '—',
        totalAmount: totalById.get(invoice.id)!,
      }));
  }, [postedInvoices, invoiceDetailQueries, soNumberById]);

  return { invoiceOptions, isLoading };
}
