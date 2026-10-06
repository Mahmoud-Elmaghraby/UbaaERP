import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CreateProductDto,
  CreateProductVariantDto,
  ProductDto,
  ProductVariantDto,
  ProductVariantLookupDto,
  ProductWithVariantsDto,
  UpdateProductDto,
  UpdateProductVariantDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: () => apiGet<ProductDto[]>('/products') });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => apiGet<ProductWithVariantsDto>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductDto) => apiPost<ProductWithVariantsDto>('/products', input),
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductDto }) =>
      apiPatch<ProductDto>(`/products/${id}`, input),
    onSuccess: (_data, variables) => invalidateCatalogue(queryClient, variables.id),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/products/${id}`),
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export function useAddProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductVariantDto) =>
      apiPost<ProductVariantDto>(`/products/${productId}/variants`, input),
    onSuccess: () => invalidateCatalogue(queryClient, productId),
  });
}

/** Every variant of every product in one request — see GET /product-variants. */
export const VARIANT_LOOKUP_QUERY_KEY = ['product-variants'] as const;

export function useVariantLookup() {
  return useQuery({
    queryKey: VARIANT_LOOKUP_QUERY_KEY,
    queryFn: () => apiGet<ProductVariantLookupDto[]>('/product-variants'),
    staleTime: 60_000,
  });
}

/** id → lookup row, for rendering product names on existing document lines. */
export function useVariantLookupMap() {
  const { data } = useVariantLookup();
  return useMemo(() => new Map((data ?? []).map((variant) => [variant.id, variant])), [data]);
}

export function useUpdateProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateProductVariantDto }) =>
      apiPatch<ProductVariantDto>(`/products/${productId}/variants/${variantId}`, input),
    onSuccess: () => invalidateCatalogue(queryClient, productId),
  });
}

function invalidateCatalogue(queryClient: QueryClient, productId?: string) {
  queryClient.invalidateQueries({ queryKey: ['products'] });
  if (productId) queryClient.invalidateQueries({ queryKey: ['products', productId] });
  queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
}
