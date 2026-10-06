import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStockCountDto,
  LoadStockCountDto,
  StockCountDto,
  StockCountKindDto,
  StockCountWithLinesDto,
  UpdateStockCountDto,
  UpsertStockCountLineDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['stock-counts'] as const;
const detailKey = (id: string) => ['stock-counts', 'detail', id] as const;

export function useStockCounts(kind: StockCountKindDto) {
  return useQuery({
    queryKey: [...LIST_KEY, kind],
    queryFn: () => apiGet<StockCountDto[]>(`/stock-counts?kind=${kind}`),
  });
}

export function useStockCount(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id ?? ''),
    queryFn: () => apiGet<StockCountWithLinesDto>(`/stock-counts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockCountDto) => apiPost<StockCountWithLinesDto>('/stock-counts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

/** Every mutation of one count returns the whole count — write it straight into the cache. */
function useCountMutation<TInput>(id: string, request: (input: TInput) => Promise<StockCountWithLinesDto | unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'lines' in data) {
        queryClient.setQueryData(detailKey(id), data);
      } else {
        void queryClient.invalidateQueries({ queryKey: detailKey(id) });
      }
      void queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: false, refetchType: 'none' });
    },
  });
}

export function useUpsertStockCountLines(id: string) {
  return useCountMutation(id, (lines: UpsertStockCountLineDto[]) =>
    apiPost<StockCountWithLinesDto>(`/stock-counts/${id}/lines`, { lines }),
  );
}

export function useDeleteStockCountLine(id: string) {
  return useCountMutation(id, (lineId: string) => apiDelete<void>(`/stock-counts/${id}/lines/${lineId}`));
}

export function useLoadStockIntoCount(id: string) {
  return useCountMutation(id, (input: LoadStockCountDto) =>
    apiPost<StockCountWithLinesDto>(`/stock-counts/${id}/load-stock`, input),
  );
}

export function useRefreshStockCount(id: string) {
  return useCountMutation(id, () => apiPost<StockCountWithLinesDto>(`/stock-counts/${id}/refresh`));
}

export function useUpdateStockCount(id: string) {
  return useCountMutation(id, (input: UpdateStockCountDto) => apiPatch<StockCountDto>(`/stock-counts/${id}`, input));
}

export function usePostStockCount(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<StockCountWithLinesDto>(`/stock-counts/${id}/post`),
    onSuccess: (data) => {
      queryClient.setQueryData(detailKey(id), data);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      // Stock changed everywhere.
      void queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-lots'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-expiring-lots'] });
    },
  });
}

export function useCancelStockCount(id: string) {
  return useCountMutation(id, () => apiPost<StockCountDto>(`/stock-counts/${id}/cancel`));
}

export function useDeleteStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/stock-counts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
