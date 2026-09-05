import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWarehouseDto,
  CreateWarehouseLocationDto,
  UpdateWarehouseDto,
  UpdateWarehouseLocationDto,
  WarehouseDto,
  WarehouseLocationDto,
  WarehouseWithDefaultLocationDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function useWarehouses() {
  return useQuery({ queryKey: ['warehouses'], queryFn: () => apiGet<WarehouseDto[]>('/warehouses') });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseDto) =>
      apiPost<WarehouseWithDefaultLocationDto>('/warehouses', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseDto }) =>
      apiPatch<WarehouseDto>(`/warehouses/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/warehouses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
  });
}

export function useWarehouseLocations(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ['warehouse-locations', warehouseId],
    queryFn: () => apiGet<WarehouseLocationDto[]>(`/warehouses/${warehouseId}/locations`),
    enabled: Boolean(warehouseId),
  });
}

export function useAddWarehouseLocation(warehouseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseLocationDto) =>
      apiPost<WarehouseLocationDto>(`/warehouses/${warehouseId}/locations`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations', warehouseId] }),
  });
}

export function useUpdateWarehouseLocation(warehouseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, input }: { locationId: string; input: UpdateWarehouseLocationDto }) =>
      apiPatch<WarehouseLocationDto>(`/warehouses/locations/${locationId}`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations', warehouseId] }),
  });
}

export function useDeleteWarehouseLocation(warehouseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string) => apiDelete<void>(`/warehouses/locations/${locationId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations', warehouseId] }),
  });
}

export function useAllWarehouseLocations() {
  const { data: warehouses } = useWarehouses();
  const results = useQueries({
    queries: (warehouses ?? []).map((w) => ({
      queryKey: ['warehouse-locations', w.id],
      queryFn: () => apiGet<WarehouseLocationDto[]>(`/warehouses/${w.id}/locations`),
      enabled: Boolean(w.id),
    })),
  });
  const isLoading = warehouses === undefined || results.some((r) => r.isLoading);
  const data = results.flatMap((r) => r.data ?? []);
  return { data, isLoading };
}
