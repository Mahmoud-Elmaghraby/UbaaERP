import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelSettlementDto,
  ChannelSettlementSummaryDto,
  ChannelUnpaidOrderDto,
  SalesChannelDto,
  SaveChannelSettlementDto,
  SaveSalesChannelDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api-client';

export function useSalesChannels() {
  return useQuery({ queryKey: ['sales-channels'], queryFn: () => apiGet<SalesChannelDto[]>('/sales-channels'), staleTime: 60_000 });
}

export function useSaveSalesChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveSalesChannelDto }) =>
      id ? apiPut<SalesChannelDto>(`/sales-channels/${id}`, input) : apiPost<SalesChannelDto>('/sales-channels', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-channels'] }),
  });
}

export function useUnpaidOrders(channelId: string | undefined) {
  return useQuery({
    queryKey: ['channel-settlements', 'unpaid', channelId],
    queryFn: () => apiGet<ChannelUnpaidOrderDto[]>(`/sales-channels/${channelId}/unpaid-orders`),
    enabled: Boolean(channelId),
  });
}

export function useChannelSettlements(channelId?: string) {
  return useQuery({
    queryKey: ['channel-settlements', 'list', channelId ?? 'all'],
    queryFn: () => apiGet<ChannelSettlementSummaryDto[]>(`/channel-settlements${channelId ? `?channelId=${channelId}` : ''}`),
  });
}

export function useChannelSettlement(id: string | undefined) {
  return useQuery({
    queryKey: ['channel-settlements', 'one', id],
    queryFn: () => apiGet<ChannelSettlementDto>(`/channel-settlements/${id}`),
    enabled: Boolean(id),
  });
}

/** Posting moves money: refresh settlements, receipts, statements and treasuries. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(['channel-settlements', 'payments-received', 'treasury', 'statements', 'sales-invoices'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

export function useSaveSettlement() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveChannelSettlementDto }) =>
      id ? apiPut<ChannelSettlementDto>(`/channel-settlements/${id}`, input) : apiPost<ChannelSettlementDto>('/channel-settlements', input),
    onSuccess: invalidate,
  });
}

export function usePostSettlement() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => apiPatch<ChannelSettlementDto>(`/channel-settlements/${id}/post`), onSuccess: invalidate });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/channel-settlements/${id}`), onSuccess: invalidate });
}
