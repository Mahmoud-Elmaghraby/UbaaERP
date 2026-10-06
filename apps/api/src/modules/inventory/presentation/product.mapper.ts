import {
  productSchema,
  productVariantLookupSchema,
  productWithVariantsSchema,
  type CreateProductDto,
  type ProductDto,
  type ProductVariantLookupDto,
  type ProductWithVariantsDto,
  type UpdateProductDto,
} from '@erp-platform/contracts';
import type { CreateProductInput, Product, UpdateProductInput } from '../domain/product.entity';
import type { ProductVariant, ProductVariantLookup } from '../domain/product-variant.entity';
import { moneyFromDto, moneyToDto } from './money.mapper';

function pricesToDto<T extends { salePrice: Product['salePrice']; purchasePrice: Product['purchasePrice'] }>(row: T) {
  return {
    ...row,
    salePrice: row.salePrice ? moneyToDto(row.salePrice) : null,
    purchasePrice: row.purchasePrice ? moneyToDto(row.purchasePrice) : null,
  };
}

export function productToDto(product: Product): ProductDto {
  return productSchema.parse(pricesToDto(product));
}

export function productWithVariantsToDto(product: Product & { variants: ProductVariant[] }): ProductWithVariantsDto {
  return productWithVariantsSchema.parse(pricesToDto(product));
}

export function variantLookupToDto(variant: ProductVariantLookup): ProductVariantLookupDto {
  return productVariantLookupSchema.parse(pricesToDto(variant));
}

/** DTO prices (wire Money) → domain Money; undefined stays undefined (= not sent / unchanged). */
export function productInputFromDto<T extends CreateProductDto | UpdateProductDto>(
  dto: T,
): Omit<T, 'salePrice' | 'purchasePrice'> & Pick<CreateProductInput & UpdateProductInput, 'salePrice' | 'purchasePrice'> {
  const { salePrice, purchasePrice, ...rest } = dto;
  return {
    ...rest,
    ...(salePrice !== undefined ? { salePrice: salePrice ? moneyFromDto(salePrice) : null } : {}),
    ...(purchasePrice !== undefined ? { purchasePrice: purchasePrice ? moneyFromDto(purchasePrice) : null } : {}),
  };
}
