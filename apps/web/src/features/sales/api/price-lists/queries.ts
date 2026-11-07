import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PriceListDto, PriceListKindDto, PriceListSummaryDto, SavePriceListDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost, apiPut } from '../../../../lib/api-client';
import { buildSalePricer, type SalePricer } from '../../../../components/product/sale-pricing';
import { PRICE_LIST_KINDS } from './price-list-kind';

/** Sales lists by default; 'purchase' = supplier price lists. */
export function usePriceLists(kind: PriceListKindDto = 'sale') {
  return useQuery({
    queryKey: ['price-lists', kind],
    queryFn: () => apiGet<PriceListSummaryDto[]>(PRICE_LIST_KINDS[kind].api),
    staleTime: 60_000,
  });
}

export function usePriceList(id: string | null | undefined, kind: PriceListKindDto = 'sale') {
  return useQuery({
    queryKey: ['price-lists', kind, id],
    queryFn: () => apiGet<PriceListDto>(`${PRICE_LIST_KINDS[kind].api}/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

/**
 * The pricer a document uses for its chosen list (null = normal prices).
 * While the list is still loading it answers with normal prices.
 */
export function useSalePricer(
  priceListId: string | null | undefined,
  currency: string,
  kind: PriceListKindDto = 'sale',
): { pricer: SalePricer; ready: boolean } {
  const { data } = usePriceList(priceListId, kind);
  const list = priceListId ? data : null;
  const ready = !priceListId || data?.id === priceListId;
  const pricer = useMemo(() => buildSalePricer(list, currency, PRICE_LIST_KINDS[kind].priceKind), [list, currency, kind]);
  return { pricer, ready };
}

export function useSavePriceList(kind: PriceListKindDto = 'sale') {
  const queryClient = useQueryClient();
  const api = PRICE_LIST_KINDS[kind].api;
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SavePriceListDto }) =>
      id ? apiPut<PriceListDto>(`${api}/${id}`, input) : apiPost<PriceListDto>(api, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['price-lists', kind] }),
  });
}

export function useDeletePriceList(kind: PriceListKindDto = 'sale') {
  const queryClient = useQueryClient();
  const api = PRICE_LIST_KINDS[kind].api;
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`${api}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['price-lists', kind] }),
  });
}
