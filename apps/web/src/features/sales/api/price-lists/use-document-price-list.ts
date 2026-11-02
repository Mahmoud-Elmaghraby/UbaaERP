import { useEffect, useRef, useState } from 'react';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';

import { repriceLines, type SalePricer } from '../../../../components/product/sale-pricing';
import { useSalePricer } from './queries';

interface PricedLine {
  productVariantId: string | undefined;
  unitOfMeasureId: string | null;
  quantity: string;
  unitPrice: string;
}

/**
 * A sales document's price list: starts at the customer's default list,
 * follows the customer when it changes, and can be switched by hand. When
 * the list changes, lines still carrying an automatic price are re-priced
 * (typed prices are kept). Opening an existing document never re-prices it.
 */
export function useDocumentPriceList<T extends PricedLine>(options: {
  customerPriceListId: string | null | undefined;
  /** Changes when another customer is picked (null/undefined while none). */
  customerId: string | null | undefined;
  currency: string;
  variants: ReadonlyMap<string, ProductVariantLookupDto>;
  setLines: (update: (lines: T[]) => T[]) => void;
}): { priceListId: string | null; setPriceListId: (id: string | null) => void; pricer: SalePricer } {
  const { customerPriceListId, customerId, currency, variants, setLines } = options;
  const [priceListId, setPriceListIdState] = useState<string | null>(customerPriceListId ?? null);
  const { pricer, ready } = useSalePricer(priceListId, currency);
  // The pricer in force before the last list change, until the new list has loaded.
  const pendingFrom = useRef<SalePricer | null>(null);
  const pricerRef = useRef(pricer);
  pricerRef.current = pricer;

  // True once the user (or a customer change) picked the list — until then
  // it quietly follows the customer's default as the customer list loads.
  const touched = useRef(false);

  function changeList(id: string | null) {
    touched.current = true;
    if (id === priceListId) return;
    pendingFrom.current ??= pricerRef.current;
    setPriceListIdState(id);
  }

  const lastCustomer = useRef(customerId);
  useEffect(() => {
    if (lastCustomer.current !== customerId) {
      lastCustomer.current = customerId;
      changeList(customerPriceListId ?? null);
    } else if (!touched.current) {
      setPriceListIdState(customerPriceListId ?? null);
    }
  }, [customerId, customerPriceListId]);

  useEffect(() => {
    if (!ready || !pendingFrom.current) return;
    const before = pendingFrom.current;
    pendingFrom.current = null;
    setLines((lines) => repriceLines(lines, variants, before, pricer));
  }, [ready, pricer, variants, setLines]);

  return { priceListId, setPriceListId: changeList, pricer };
}
