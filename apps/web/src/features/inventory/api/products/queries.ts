import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ProductImageDto,
  CreateProductDto,
  CreateProductVariantDto,
  ProductDto,
  ProductVariantDto,
  ProductVariantLookupDto,
  ProductWithVariantsDto,
  UpdateProductDto,
  UpdateProductVariantDto,
  CreateProductBarcodeDto,
  GenerateProductVariantsDto,
  ProductBarcodeDto,
  ProductUnitDto,
  ProductUnitInputDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from '../../../../lib/api-client';

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

/** Options (size, colour…) and values already used on this tenant's variants — offered as one-click choices. */
export function useVariantOptionSuggestions() {
  return useQuery({
    queryKey: ['products', 'variant-options'],
    queryFn: () => apiGet<{ name: string; values: string[] }[]>('/products/variant-options'),
    staleTime: 60_000,
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

export function useVariantBarcodes(productId: string, variantId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'variants', variantId, 'barcodes'],
    queryFn: () => apiGet<ProductBarcodeDto[]>(`/products/${productId}/variants/${variantId}/barcodes`),
    enabled: Boolean(variantId),
  });
}

export function useAddVariantBarcode(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductBarcodeDto) =>
      apiPost<ProductBarcodeDto>(`/products/${productId}/variants/${variantId}/barcodes`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'variants', variantId, 'barcodes'] });
      queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
    },
  });
}

export function useDeleteVariantBarcode(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (barcodeId: string) =>
      apiDelete<void>(`/products/${productId}/variants/${variantId}/barcodes/${barcodeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'variants', variantId, 'barcodes'] });
      queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
    },
  });
}

/** Variant matrix — creates every missing combination of the given option values. */
export function useGenerateVariants(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateProductVariantsDto) =>
      apiPost<ProductVariantDto[]>(`/products/${productId}/variants/generate`, input),
    onSuccess: () => invalidateCatalogue(queryClient, productId),
  });
}

function invalidateCatalogue(queryClient: QueryClient, productId?: string) {
  queryClient.invalidateQueries({ queryKey: ['products'] });
  if (productId) queryClient.invalidateQueries({ queryKey: ['products', productId] });
  queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
}

/** A product's extra trading units (carton, sack…). */
export function useProductUnits(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'units'],
    queryFn: () => apiGet<ProductUnitDto[]>(`/products/${productId}/units`),
    enabled: Boolean(productId),
  });
}

export function useReplaceProductUnits(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (units: ProductUnitInputDto[]) => apiPut<ProductUnitDto[]>(`/products/${productId}/units`, { units }),
    onSuccess: (data) => {
      queryClient.setQueryData(['products', productId, 'units'], data);
      void queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
    },
  });
}

// ---- item images (migration 0085) ------------------------------------------

const imagesKey = (productId: string) => ['products', productId, 'images'] as const;

export function useProductImages(productId: string | undefined) {
  return useQuery({
    queryKey: imagesKey(productId ?? ''),
    queryFn: () => apiGet<ProductImageDto[]>(`/products/${productId}/images`),
    enabled: Boolean(productId),
  });
}

/** After any image change the lists' thumbnails change too. */
function invalidateImages(queryClient: QueryClient, productId: string) {
  void queryClient.invalidateQueries({ queryKey: imagesKey(productId) });
  void queryClient.invalidateQueries({ queryKey: ['products'], exact: true });
  void queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
}

export function useUploadProductImage(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ image, thumbnail, productVariantId }: { image: Blob; thumbnail?: Blob; productVariantId?: string | null }) => {
      const form = new FormData();
      const extension = (blob: Blob) => (blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg');
      form.append('image', image, `image.${extension(image)}`);
      if (thumbnail) form.append('thumbnail', thumbnail, `thumbnail.${extension(thumbnail)}`);
      if (productVariantId) form.append('productVariantId', productVariantId);
      return apiUpload<ProductImageDto>(`/products/${productId}/images`, form);
    },
    onSuccess: () => invalidateImages(queryClient, productId),
  });
}

export function useSetPrimaryProductImage(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => apiPost<ProductImageDto[]>(`/products/${productId}/images/${imageId}/primary`),
    onSuccess: () => invalidateImages(queryClient, productId),
  });
}

export function useDeleteProductImage(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => apiDelete<void>(`/products/${productId}/images/${imageId}`),
    onSuccess: () => invalidateImages(queryClient, productId),
  });
}
