import { useQuery } from '@tanstack/react-query';
import type { PurchaseAnalysisQueryDto, PurchaseAnalysisReportDto, PurchasePriceHistoryDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';

export function usePurchaseAnalysis(query: Partial<PurchaseAnalysisQueryDto>, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return useQuery({
    queryKey: ['purchase-reports', 'analysis', query],
    queryFn: () => apiGet<PurchaseAnalysisReportDto>(`/purchase-reports/analysis?${params.toString()}`),
    enabled,
  });
}

/** An item's last purchase prices (posted invoices), plus the last one from `supplierId` when given. */
export function usePurchasePriceHistory(productVariantId: string | null | undefined, supplierId?: string | null) {
  const params = new URLSearchParams({ productVariantId: productVariantId ?? '', limit: '8' });
  if (supplierId) params.set('supplierId', supplierId);
  return useQuery({
    queryKey: ['purchase-reports', 'price-history', productVariantId, supplierId ?? null],
    queryFn: () => apiGet<PurchasePriceHistoryDto>(`/purchase-reports/price-history?${params.toString()}`),
    enabled: Boolean(productVariantId),
    staleTime: 60_000,
  });
}
