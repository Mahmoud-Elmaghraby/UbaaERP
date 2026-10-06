import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExpiringLotDto,
  RecordStockMovementDto,
  SetReorderPointDto,
  StockLevelDto,
  StockLotDto,
  StockMovementDto,
  TransferStockDto,
} from '@erp-platform/contracts';

import { apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export interface StockLevelFilters {
  warehouseId?: string;
  locationId?: string;
  productVariantId?: string;
}

// `filters` is typed as `object` (not `Record<string, ...>`) on purpose: StockLevelFilters/
// StockMovementFilters are plain interfaces without an index signature, and TS will not let an
// interface be passed where a Record<string, V> is expected even though every property matches —
// it demands an explicit index signature. `object` has no such requirement and Object.entries()
// still resolves correctly against it (via its `entries(o: {}): [string, any][]` overload).
function buildStockQuery(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useStockLevels(filters: StockLevelFilters = {}) {
  return useQuery({
    queryKey: ['stock-levels', filters],
    queryFn: () => apiGet<StockLevelDto[]>(`/stock/levels${buildStockQuery(filters)}`),
  });
}

export function useSetReorderPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetReorderPointDto }) =>
      apiPatch<StockLevelDto>(`/stock/levels/${id}/reorder-point`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-levels'] }),
  });
}

export interface StockMovementFilters {
  warehouseId?: string;
  locationId?: string;
  productVariantId?: string;
  limit?: number;
}

export function useStockMovements(filters: StockMovementFilters = {}) {
  return useQuery({
    queryKey: ['stock-movements', filters],
    queryFn: () => apiGet<StockMovementDto[]>(`/stock/movements${buildStockQuery(filters)}`),
  });
}

export function useRecordStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordStockMovementDto) =>
      apiPost<StockMovementDto>('/stock/movements', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferStockDto) =>
      apiPost<{ transferOut: StockMovementDto; transferIn: StockMovementDto }>(
        '/stock/transfers',
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

export function useStockLots(productVariantId: string | undefined) {
  return useQuery({
    queryKey: ['stock-lots', productVariantId],
    queryFn: () => apiGet<StockLotDto[]>(`/stock/lots?productVariantId=${productVariantId}`),
    enabled: Boolean(productVariantId),
  });
}

/** Near-expiry report — lots on hand expiring within `withinDays` (expired ones included). */
export function useExpiringLots(withinDays: number) {
  return useQuery({
    queryKey: ['stock-expiring-lots', withinDays],
    queryFn: () => apiGet<ExpiringLotDto[]>(`/stock/expiring-lots?withinDays=${withinDays}`),
  });
}
