import { useMemo } from 'react';
import type { QuotationDto } from '@erp-platform/contracts';

import { useCustomers } from '../../api/customers/queries';
import { useQuotations } from '../../api/quotations/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';

export interface EligibleQuotation {
  quotation: QuotationDto;
  customerName: string;
}

/**
 * Sales orders can be created "from a quotation" — but only from a quotation that is
 * (a) status === 'accepted' and (b) doesn't already have a sales order created from it.
 * The backend does not enforce (b) itself (nothing stops a second sales order from
 * referencing the same quotation), so this is a client-side dedup for a sane
 * create-sales-order UX — same reasoning as Purchases'
 * hooks/purchase-orders/use-eligible-quotations.ts.
 *
 * Unlike that Purchases hook, GET /quotations has no required filter (see
 * api/quotations/queries.ts), so this doesn't need the RFQ fan-out — a single
 * unscoped list is enough.
 */
export function useEligibleQuotations() {
  const { data: quotations, isLoading: quotationsLoading } = useQuotations();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: salesOrders, isLoading: salesOrdersLoading } = useSalesOrders();

  const eligibleQuotations = useMemo<EligibleQuotation[]>(() => {
    const customerNameById = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));
    const usedQuotationIds = new Set(
      (salesOrders ?? [])
        .map((order) => order.sourceQuotationId)
        .filter((id): id is string => Boolean(id)),
    );

    return (quotations ?? [])
      .filter((quotation) => quotation.status === 'accepted' && !usedQuotationIds.has(quotation.id))
      .map((quotation) => ({
        quotation,
        customerName: customerNameById.get(quotation.customerId) ?? '—',
      }));
  }, [quotations, customers, salesOrders]);

  return { eligibleQuotations, isLoading: quotationsLoading || customersLoading || salesOrdersLoading };
}
