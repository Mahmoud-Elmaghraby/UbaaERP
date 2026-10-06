import { useQuery } from '@tanstack/react-query';
import type { ItemCardDto, LowStockRowDto, StockValuationRowDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function useItemCard(filter: { productVariantId?: string; warehouseId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['inventory-reports', 'item-card', filter],
    queryFn: () => apiGet<ItemCardDto>(`/inventory-reports/item-card${query(filter)}`),
    enabled: Boolean(filter.productVariantId),
  });
}

export function useStockValuation(warehouseId?: string) {
  return useQuery({
    queryKey: ['inventory-reports', 'valuation', warehouseId ?? null],
    queryFn: () => apiGet<StockValuationRowDto[]>(`/inventory-reports/valuation${query({ warehouseId })}`),
  });
}

export function useLowStock(warehouseId?: string) {
  return useQuery({
    queryKey: ['inventory-reports', 'low-stock', warehouseId ?? null],
    queryFn: () => apiGet<LowStockRowDto[]>(`/inventory-reports/low-stock${query({ warehouseId })}`),
  });
}
