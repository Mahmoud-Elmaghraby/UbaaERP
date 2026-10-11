import {
  productSchema,
  productVariantSchema,
  productVariantLookupSchema,
  productWithVariantsSchema,
  type CreateProductDto,
  type MoneyDto,
  type ProductVariantDto,
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
  return productWithVariantsSchema.parse({ ...pricesToDto(product), variants: product.variants.map((v) => pricesToDto(v)) });
}

export function variantToDto(variant: ProductVariant): ProductVariantDto {
  return productVariantSchema.parse(pricesToDto(variant));
}

/** Variant price fields from the wire: undefined = unchanged, null = the product's price. */
export function variantPricesFromDto(dto: { salePrice?: MoneyDto | null; purchasePrice?: MoneyDto | null }) {
  return {
    ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice ? moneyFromDto(dto.salePrice) : null } : {}),
    ...(dto.purchasePrice !== undefined ? { purchasePrice: dto.purchasePrice ? moneyFromDto(dto.purchasePrice) : null } : {}),
  };
}

export function variantLookupToDto(variant: ProductVariantLookup): ProductVariantLookupDto {
  return productVariantLookupSchema.parse({
    ...pricesToDto(variant),
    units: variant.units.map((unit) => pricesToDto(unit)),
  });
}

/** DTO prices (wire Money) → domain Money; undefined stays undefined (= not sent / unchanged). */
export function productInputFromDto<T extends CreateProductDto | UpdateProductDto>(
  dto: T,
): Omit<T, 'salePrice' | 'purchasePrice' | 'variantPrices'> &
  Pick<CreateProductInput & UpdateProductInput, 'salePrice' | 'purchasePrice'> &
  Pick<CreateProductInput, 'variantPrices'> {
  const { salePrice, purchasePrice, ...rest } = dto;
  const { variantPrices, ...others } = rest as typeof rest & { variantPrices?: CreateProductDto['variantPrices'] };
  return {
    ...(others as Omit<T, 'salePrice' | 'purchasePrice' | 'variantPrices'>),
    ...(variantPrices
      ? { variantPrices: variantPrices.map((p) => ({ attributeValues: p.attributeValues, ...variantPricesFromDto(p) })) }
      : {}),
    ...(salePrice !== undefined ? { salePrice: salePrice ? moneyFromDto(salePrice) : null } : {}),
    ...(purchasePrice !== undefined ? { purchasePrice: purchasePrice ? moneyFromDto(purchasePrice) : null } : {}),
  };
}
