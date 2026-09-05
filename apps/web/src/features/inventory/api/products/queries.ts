import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductDto,
  CreateProductVariantDto,
  ProductDto,
  ProductVariantDto,
  ProductWithVariantsDto,
  UpdateProductDto,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductDto }) =>
      apiPatch<ProductDto>(`/products/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', variables.id] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useAddProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductVariantDto) =>
      apiPost<ProductVariantDto>(`/products/${productId}/variants`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
    },
  });
}

export function useProductsWithVariants() {
  const { data: products } = useProducts();
  const results = useQueries({
    queries: (products ?? []).map((p) => ({
      queryKey: ['products', p.id],
      queryFn: () => apiGet<ProductWithVariantsDto>(`/products/${p.id}`),
      enabled: Boolean(p.id),
    })),
  });
  const isLoading = products === undefined || results.some((r) => r.isLoading);
  const data = results
    .map((r) => r.data)
    .filter((d): d is ProductWithVariantsDto => Boolean(d));
  return { data, isLoading };
}
