import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MoneyDto } from '@erp-platform/contracts';
import {
  Combobox,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';

import { useCategoryOptions, useProductBrands } from '../../api/catalog/queries';
import { useTaxRuleLookup } from '../../../settings/queries';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { WhenTaxesInUse } from '../../../../components/taxes/when-taxes-in-use';

/** Radix Select can't hold an empty value — this stands for "none". */
const NONE = '__none__';

/** Default sale / purchase price as editable decimal text, converted to MoneyDto on submit. */
export function usePriceDrafts(initial?: { salePrice: MoneyDto | null; purchasePrice: MoneyDto | null }) {
  const [sale, setSale] = useState(initial?.salePrice ? minorUnitsToDecimalString(initial.salePrice.amountMinorUnits) : '');
  const [purchase, setPurchase] = useState(
    initial?.purchasePrice ? minorUnitsToDecimalString(initial.purchasePrice.amountMinorUnits) : '',
  );

  /** null = cleared; 'invalid' = text that isn't a non-negative amount. */
  function resolve(currency: string): { salePrice: MoneyDto | null; purchasePrice: MoneyDto | null } | 'invalid' {
    const toMoney = (text: string): MoneyDto | null | 'invalid' => {
      if (!text.trim()) return null;
      try {
        const minor = decimalToMinorUnits(text);
        return BigInt(minor) < 0n ? 'invalid' : { amountMinorUnits: minor, currency };
      } catch {
        return 'invalid';
      }
    };
    const salePrice = toMoney(sale);
    const purchasePrice = toMoney(purchase);
    if (salePrice === 'invalid' || purchasePrice === 'invalid') return 'invalid';
    return { salePrice, purchasePrice };
  }

  return { sale, setSale, purchase, setPurchase, resolve };
}

/**
 * Classification + commercial defaults shared by the create and edit product forms:
 * item type, category, brand, default prices and tax rule. Registered fields
 * (itemType/categoryId/brandId/taxRuleId) go through the surrounding react-hook-form
 * (useFormContext); prices are plain text handled by usePriceDrafts.
 */
export function ProductMasterDataFields({
  prices,
  currency,
}: {
  prices: ReturnType<typeof usePriceDrafts>;
  currency: string;
}) {
  const { t } = useTranslation();
  const form = useFormContext();
  const { options: categories } = useCategoryOptions();
  const { data: brands } = useProductBrands();
  const { data: taxRules } = useTaxRuleLookup();

  return (
    <div className="grid gap-4 rounded-lg border bg-subtle p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="itemType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.itemType')}</FormLabel>
              <Select value={field.value ?? 'stock'} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="stock">{t('inventory.products.itemTypeStock')}</SelectItem>
                  <SelectItem value="service">{t('inventory.products.itemTypeService')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.category')}</FormLabel>
              <Combobox
                items={categories.filter((option) => option.isActive || option.id === field.value)}
                value={field.value ?? null}
                onValueChange={(id) => field.onChange(id)}
                getValue={(option) => option.id}
                getLabel={(option) => option.path}
                placeholder={t('inventory.products.noCategory')}
                searchPlaceholder={t('common.search')}
                emptyText={t('common.noResults')}
              />
              {field.value ? (
                <button
                  type="button"
                  className="justify-self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => field.onChange(null)}
                >
                  {t('inventory.products.clearCategory')}
                </button>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="brandId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.brand')}</FormLabel>
              <Select value={field.value ?? NONE} onValueChange={(value) => field.onChange(value === NONE ? null : value)}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>{t('inventory.products.noBrand')}</SelectItem>
                  {(brands ?? [])
                    .filter((brand) => brand.isActive || brand.id === field.value)
                    .map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <WhenTaxesInUse>
          <FormField
            control={form.control}
            name="taxRuleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('inventory.products.taxRule')}</FormLabel>
                <Select value={field.value ?? NONE} onValueChange={(value) => field.onChange(value === NONE ? null : value)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('inventory.products.noTaxRule')}</SelectItem>
                    {(taxRules ?? [])
                      .filter((rule) => rule.kind !== 'withholding')
                      .map((rule) => (
                        <SelectItem key={rule.id} value={rule.id}>
                          {rule.name} ({rule.rate}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </WhenTaxesInUse>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.products.salePrice', { currency })}</label>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            className="text-end"
            value={prices.sale}
            onChange={(e) => prices.setSale(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.products.purchasePrice', { currency })}</label>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            className="text-end"
            value={prices.purchase}
            onChange={(e) => prices.setPurchase(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
