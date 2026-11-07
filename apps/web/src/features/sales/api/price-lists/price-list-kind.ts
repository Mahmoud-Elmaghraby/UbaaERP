import type { PriceListKindDto } from '@erp-platform/contracts';

/** Where each kind of price list lives: API path, screen path, the permission that manages it, the default price it starts from. */
export const PRICE_LIST_KINDS: Record<
  PriceListKindDto,
  { api: string; path: string; permission: string; priceKind: 'sale' | 'purchase' }
> = {
  sale: { api: '/price-lists', path: '/sales/price-lists', permission: 'sales.manage', priceKind: 'sale' },
  purchase: { api: '/purchase-price-lists', path: '/purchases/price-lists', permission: 'purchases.manage', priceKind: 'purchase' },
};
