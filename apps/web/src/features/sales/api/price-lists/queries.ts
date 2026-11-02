import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PriceListDto, PriceListSummaryDto, SavePriceListDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost, apiPut } from '../../../../lib/api-client';
import { buildSalePricer, type SalePricer } from '../../../../components/product/sale-pricing';

export function usePriceLists() {
  return useQuery({
    queryKey: ['price-lists'],
    queryFn: () => apiGet<PriceListSummaryDto[]>('/price-lists'),
    staleTime: 60_000,
  });
}

export function usePriceList(id: string | null | undefined) {
  return useQuery({
    queryKey: ['price-lists', id],
    queryFn: () => apiGet<PriceListDto>(`/price-lists/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

/**
 * The pricer a sales document uses for its chosen list (null = normal
 * prices). While the list is still loading it answers with normal prices.
 */
export function useSalePricer(
  priceListId: string | null | undefined,
  currency: string,
): { pricer: SalePricer; ready: boolean } {
  const { data } = usePriceList(priceListId);
  const list = priceListId ? data : null;
  const ready = !priceListId || data?.id === priceListId;
  const pricer = useMemo(() => buildSalePricer(list, currency), [list, currency]);
  return { pricer, ready };
}

export function useSavePriceList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SavePriceListDto }) =>
      id ? apiPut<PriceListDto>(`/price-lists/${id}`, input) : apiPost<PriceListDto>('/price-lists', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}

export function useDeletePriceList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/price-lists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}
