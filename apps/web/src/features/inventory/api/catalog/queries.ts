import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductBrandDto,
  CreateProductCategoryDto,
  InventorySettingsDto,
  ProductBrandDto,
  ProductCategoryDto,
  UpdateInventorySettingsDto,
  UpdateProductBrandDto,
  UpdateProductCategoryDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const CATEGORIES_KEY = ['product-categories'] as const;
const BRANDS_KEY = ['product-brands'] as const;
const SETTINGS_KEY = ['inventory-settings'] as const;

export function useInventorySettings(enabled = true) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiGet<InventorySettingsDto>('/inventory-settings'),
    enabled,
  });
}

export function useUpdateInventorySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInventorySettingsDto) => apiPatch<InventorySettingsDto>('/inventory-settings', input),
    onSuccess: (data) => queryClient.setQueryData(SETTINGS_KEY, data),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => apiGet<ProductCategoryDto[]>('/product-categories'),
    staleTime: 60_000,
  });
}

export interface CategoryOption {
  id: string;
  /** "Tiles › Floor › 60×60" */
  path: string;
  depth: number;
  isActive: boolean;
  category: ProductCategoryDto;
}

/** Categories flattened depth-first with their full path — for pickers and the tree list. */
export function useCategoryOptions(): { options: CategoryOption[]; isLoading: boolean } {
  const { data, isLoading } = useProductCategories();
  const options = useMemo(() => {
    const byParent = new Map<string | null, ProductCategoryDto[]>();
    for (const category of data ?? []) {
      const list = byParent.get(category.parentId) ?? [];
      list.push(category);
      byParent.set(category.parentId, list);
    }
    const result: CategoryOption[] = [];
    const visit = (parentId: string | null, prefix: string, depth: number) => {
      for (const category of (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ar'))) {
        const path = prefix ? `${prefix} › ${category.name}` : category.name;
        result.push({ id: category.id, path, depth, isActive: category.isActive, category });
        if (depth < 20) visit(category.id, path, depth + 1);
      }
    };
    visit(null, '', 0);
    return result;
  }, [data]);
  return { options, isLoading };
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductCategoryDto) => apiPost<ProductCategoryDto>('/product-categories', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductCategoryDto }) =>
      apiPatch<ProductCategoryDto>(`/product-categories/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/product-categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useProductBrands() {
  return useQuery({
    queryKey: BRANDS_KEY,
    queryFn: () => apiGet<ProductBrandDto[]>('/product-brands'),
    staleTime: 60_000,
  });
}

export function useCreateProductBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductBrandDto) => apiPost<ProductBrandDto>('/product-brands', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDS_KEY }),
  });
}

export function useUpdateProductBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductBrandDto }) =>
      apiPatch<ProductBrandDto>(`/product-brands/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDS_KEY }),
  });
}

export function useDeleteProductBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/product-brands/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDS_KEY }),
  });
}
