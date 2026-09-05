import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { SupplierQuotationDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';
import { useRfqs } from '../../api/rfqs/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';

export interface EligibleQuotation {
  quotation: SupplierQuotationDto;
  rfqNumber: string;
  supplierName: string;
}

/**
 * Purchase orders can be created "from a quotation" — but only from a
 * supplier quotation that is (a) status === 'selected' and (b) doesn't
 * already have a purchase order created from it. The backend does not
 * enforce (b) itself (nothing stops a second PO from referencing the same
 * quotation), so this is a client-side dedup for a sane create-PO UX.
 *
 * A quotation only ever reaches 'selected' as a side effect of closing its
 * RFQ (see SupplierQuotationsService.select()), so scanning RFQs with
 * status === 'closed' is a correct and reasonably narrow way to find every
 * candidate quotation, rather than fetching all quotations unscoped (which
 * the backend doesn't even support — GET /supplier-quotations requires
 * ?rfqId=).
 *
 * Fans out one request per closed RFQ via useQueries — the same "composed
 * bulk-lookup" pattern already used by Inventory's useProductsWithVariants.
 * Query keys intentionally match useSupplierQuotations()'s
 * ['supplier-quotations', 'by-rfq', rfqId] shape so the cache is shared.
 */
export function useEligibleQuotations() {
  const { data: rfqs, isLoading: rfqsLoading } = useRfqs();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: purchaseOrders, isLoading: purchaseOrdersLoading } = usePurchaseOrders();

  const closedRfqs = useMemo(() => (rfqs ?? []).filter((rfq) => rfq.status === 'closed'), [rfqs]);

  const quotationQueries = useQueries({
    queries: closedRfqs.map((rfq) => ({
      queryKey: ['supplier-quotations', 'by-rfq', rfq.id],
      queryFn: () => apiGet<SupplierQuotationDto[]>(`/supplier-quotations?rfqId=${rfq.id}`),
    })),
  });

  const isLoading =
    rfqsLoading || suppliersLoading || purchaseOrdersLoading || quotationQueries.some((q) => q.isLoading);

  const eligibleQuotations = useMemo<EligibleQuotation[]>(() => {
    const supplierNameById = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));
    const rfqNumberById = new Map(closedRfqs.map((rfq) => [rfq.id, rfq.rfqNumber]));
    const usedQuotationIds = new Set(
      (purchaseOrders ?? [])
        .map((po) => po.sourceQuotationId)
        .filter((id): id is string => Boolean(id)),
    );

    const result: EligibleQuotation[] = [];
    for (const query of quotationQueries) {
      for (const quotation of query.data ?? []) {
        if (quotation.status !== 'selected') continue;
        if (usedQuotationIds.has(quotation.id)) continue;
        result.push({
          quotation,
          rfqNumber: rfqNumberById.get(quotation.rfqId) ?? '—',
          supplierName: supplierNameById.get(quotation.supplierId) ?? '—',
        });
      }
    }
    return result;
  }, [quotationQueries, suppliers, closedRfqs, purchaseOrders]);

  return { eligibleQuotations, isLoading };
}
