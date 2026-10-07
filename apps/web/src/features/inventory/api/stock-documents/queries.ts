import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CreateStockAdjustmentDto,
  CreateStockAdjustmentReasonDto,
  CreateStockTransferDto,
  InTransitValueDto,
  ReceiveStockTransferDto,
  StockAdjustmentDto,
  StockAdjustmentReasonDto,
  StockAdjustmentStatusDto,
  StockAdjustmentWithLinesDto,
  StockTransferDto,
  StockTransferStatusDto,
  StockTransferWithLinesDto,
  UpdateStockAdjustmentDto,
  UpdateStockAdjustmentReasonDto,
  UpdateStockTransferDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const TRANSFERS = ['stock-transfers'] as const;
const ADJUSTMENTS = ['stock-adjustments'] as const;
const REASONS = ['stock-adjustment-reasons'] as const;

/** Anything that moved stock: refresh every stock view. */
export function invalidateStockViews(queryClient: QueryClient) {
  for (const key of [
    'stock-levels',
    'stock-movements',
    'inventory-reports',
    'stock-lots',
    'stock-expiring-lots',
    'stock-transfers',
    'stock-adjustments',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

// ---- transfers ------------------------------------------------------------

export function useStockTransfers(status?: StockTransferStatusDto) {
  return useQuery({
    queryKey: [...TRANSFERS, 'list', status ?? 'all'],
    queryFn: () => apiGet<StockTransferDto[]>(`/stock-transfers${status ? `?status=${status}` : ''}`),
  });
}

export function useStockTransfer(id: string | undefined) {
  return useQuery({
    queryKey: [...TRANSFERS, 'detail', id ?? ''],
    queryFn: () => apiGet<StockTransferWithLinesDto>(`/stock-transfers/${id}`),
    enabled: Boolean(id),
  });
}

export function useInTransitValue(enabled = true) {
  return useQuery({
    queryKey: [...TRANSFERS, 'in-transit-value'],
    queryFn: () => apiGet<InTransitValueDto[]>('/stock-transfers/in-transit-value'),
    enabled,
  });
}

function useTransferMutation<TInput>(request: (input: TInput) => Promise<StockTransferWithLinesDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (data) => {
      queryClient.setQueryData([...TRANSFERS, 'detail', data.id], data);
      invalidateStockViews(queryClient);
    },
  });
}

export function useCreateStockTransfer() {
  return useTransferMutation((input: CreateStockTransferDto) =>
    apiPost<StockTransferWithLinesDto>('/stock-transfers', input),
  );
}

export function useUpdateStockTransfer(id: string) {
  return useTransferMutation((input: UpdateStockTransferDto) =>
    apiPatch<StockTransferWithLinesDto>(`/stock-transfers/${id}`, input),
  );
}

export type StockTransferActionInput =
  | { id: string; action: 'dispatch' | 'post' | 'cancel' }
  | { id: string; action: 'receive'; body: ReceiveStockTransferDto };

export function useStockTransferAction() {
  return useTransferMutation((input: StockTransferActionInput) =>
    apiPost<StockTransferWithLinesDto>(
      `/stock-transfers/${input.id}/${input.action}`,
      input.action === 'receive' ? input.body : undefined,
    ),
  );
}

export function useDeleteStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/stock-transfers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TRANSFERS }),
  });
}

// ---- adjustments ------------------------------------------------------------

export function useStockAdjustments(status?: StockAdjustmentStatusDto) {
  return useQuery({
    queryKey: [...ADJUSTMENTS, 'list', status ?? 'all'],
    queryFn: () => apiGet<StockAdjustmentDto[]>(`/stock-adjustments${status ? `?status=${status}` : ''}`),
  });
}

export function useStockAdjustment(id: string | undefined) {
  return useQuery({
    queryKey: [...ADJUSTMENTS, 'detail', id ?? ''],
    queryFn: () => apiGet<StockAdjustmentWithLinesDto>(`/stock-adjustments/${id}`),
    enabled: Boolean(id),
  });
}

function useAdjustmentMutation<TInput>(request: (input: TInput) => Promise<StockAdjustmentWithLinesDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (data) => {
      queryClient.setQueryData([...ADJUSTMENTS, 'detail', data.id], data);
      invalidateStockViews(queryClient);
    },
  });
}

export function useCreateStockAdjustment() {
  return useAdjustmentMutation((input: CreateStockAdjustmentDto) =>
    apiPost<StockAdjustmentWithLinesDto>('/stock-adjustments', input),
  );
}

export function useUpdateStockAdjustment(id: string) {
  return useAdjustmentMutation((input: UpdateStockAdjustmentDto) =>
    apiPatch<StockAdjustmentWithLinesDto>(`/stock-adjustments/${id}`, input),
  );
}

export function useStockAdjustmentAction() {
  return useAdjustmentMutation((input: { id: string; action: 'post' | 'cancel' }) =>
    apiPost<StockAdjustmentWithLinesDto>(`/stock-adjustments/${input.id}/${input.action}`),
  );
}

export function useDeleteStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/stock-adjustments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADJUSTMENTS }),
  });
}

// ---- reasons ------------------------------------------------------------------

export function useAdjustmentReasons(enabled = true) {
  return useQuery({
    queryKey: REASONS,
    queryFn: () => apiGet<StockAdjustmentReasonDto[]>('/stock-adjustment-reasons'),
    enabled,
  });
}

export function useCreateAdjustmentReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockAdjustmentReasonDto) =>
      apiPost<StockAdjustmentReasonDto>('/stock-adjustment-reasons', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REASONS }),
  });
}

export function useUpdateAdjustmentReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStockAdjustmentReasonDto }) =>
      apiPatch<StockAdjustmentReasonDto>(`/stock-adjustment-reasons/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REASONS }),
  });
}

export function useDeleteAdjustmentReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/stock-adjustment-reasons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REASONS }),
  });
}
