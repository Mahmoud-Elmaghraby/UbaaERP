import { useEffect, useRef, useState } from 'react';
import type { PriceListKindDto, ProductVariantLookupDto } from '@erp-platform/contracts';

import { repriceLines, type SalePricer } from '../../../../components/product/sale-pricing';
import { useSalePricer } from './queries';

interface PricedLine {
  productVariantId: string | undefined;
  unitOfMeasureId: string | null;
  quantity: string;
  unitPrice: string;
}

/**
 * A document's price list: starts at the party's default list (the customer's on
 * sales documents, the supplier's on purchase documents — `kind`), follows the party
 * when it changes, and can be switched by hand. When
 * the list changes, lines still carrying an automatic price are re-priced
 * (typed prices are kept). Opening an existing document never re-prices it.
 */
export function useDocumentPriceList<T extends PricedLine>(options: {
  partyPriceListId: string | null | undefined;
  /** Changes when another customer/supplier is picked (null/undefined while none). */
  partyId: string | null | undefined;
  /** 'sale' (default) or 'purchase' (supplier price lists). */
  kind?: PriceListKindDto;
  currency: string;
  variants: ReadonlyMap<string, ProductVariantLookupDto>;
  setLines: (update: (lines: T[]) => T[]) => void;
}): { priceListId: string | null; setPriceListId: (id: string | null) => void; pricer: SalePricer } {
  const { partyPriceListId, partyId, currency, variants, setLines, kind = 'sale' } = options;
  const [priceListId, setPriceListIdState] = useState<string | null>(partyPriceListId ?? null);
  const { pricer, ready } = useSalePricer(priceListId, currency, kind);
  // The pricer in force before the last list change, until the new list has loaded.
  const pendingFrom = useRef<SalePricer | null>(null);
  const pricerRef = useRef(pricer);
  pricerRef.current = pricer;

  // True once the user (or a party change) picked the list — until then
  // it quietly follows the party's default as the party list loads.
  const touched = useRef(false);

  function changeList(id: string | null) {
    touched.current = true;
    if (id === priceListId) return;
    pendingFrom.current ??= pricerRef.current;
    setPriceListIdState(id);
  }

  const lastParty = useRef(partyId);
  useEffect(() => {
    if (lastParty.current !== partyId) {
      lastParty.current = partyId;
      changeList(partyPriceListId ?? null);
    } else if (!touched.current) {
      setPriceListIdState(partyPriceListId ?? null);
    }
  }, [partyId, partyPriceListId]);

  useEffect(() => {
    if (!ready || !pendingFrom.current) return;
    const before = pendingFrom.current;
    pendingFrom.current = null;
    setLines((lines) => repriceLines(lines, variants, before, pricer));
  }, [ready, pricer, variants, setLines]);

  return { priceListId, setPriceListId: changeList, pricer };
}
