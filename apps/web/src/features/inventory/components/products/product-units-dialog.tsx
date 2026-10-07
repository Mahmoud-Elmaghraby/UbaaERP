import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductDto, ProductUnitDto, ProductUnitInputDto } from '@erp-platform/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useProductUnits, useReplaceProductUnits } from '../../api/products/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { useTenantSettings } from '../../../settings/queries';
import { ApiError } from '../../../../lib/api-client';
import {
  decimalToMinorUnits,
  minorUnitsToDecimalString,
  multiplyMinorUnits,
  formatAmount,
} from '../../../../lib/money';
import { toWesternDigits } from '../../../../lib/search-normalize';

interface UnitRow {
  key: string;
  unitOfMeasureId: string;
  factor: string;
  salePrice: string;
  purchasePrice: string;
  isDefaultSale: boolean;
  isDefaultPurchase: boolean;
}

let keySeq = 0;
const newKey = () => `unit-${(keySeq += 1)}`;

function rowFromDto(unit: ProductUnitDto): UnitRow {
  return {
    key: newKey(),
    unitOfMeasureId: unit.unitOfMeasureId,
    factor: String(unit.factor),
    salePrice: unit.salePrice ? minorUnitsToDecimalString(unit.salePrice.amountMinorUnits) : '',
    purchasePrice: unit.purchasePrice ? minorUnitsToDecimalString(unit.purchasePrice.amountMinorUnits) : '',
    isDefaultSale: unit.isDefaultSale,
    isDefaultPurchase: unit.isDefaultPurchase,
  };
}

/**
 * Units & prices of one product: the base unit is the product's own; here
 * the user adds the packs it is also bought / sold in (كرتونة = 12، شكارة =
 * 50 كجم…), each with an optional own price and a default for sales / for
 * purchases.
 */
export function ProductUnitsDialog({ product, onClose }: { product: ProductDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.productUnits.title')} — {product?.name}
          </DialogTitle>
        </DialogHeader>
        {product ? <ProductUnitsEditor product={product} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ProductUnitsEditor({ product, onDone }: { product: ProductDto; onDone: () => void }) {
  const { t } = useTranslation();
  const { data: saved, isLoading } = useProductUnits(product.id);
  const { data: unitsOfMeasure } = useUnitsOfMeasure();
  const { data: tenantSettings } = useTenantSettings();
  const currency = tenantSettings?.currencyCode ?? 'EGP';
  const replace = useReplaceProductUnits(product.id);
  const [rows, setRows] = useState<UnitRow[] | null>(null);
  const current = rows ?? (saved ?? []).map(rowFromDto);
  const baseUnit = unitsOfMeasure?.find((unit) => unit.id === product.unitOfMeasureId);
  const choices = (unitsOfMeasure ?? []).filter((unit) => unit.id !== product.unitOfMeasureId && unit.isActive);

  function update(key: string, patch: Partial<UnitRow>) {
    setRows(current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setDefault(key: string, field: 'isDefaultSale' | 'isDefaultPurchase', checked: boolean) {
    setRows(current.map((row) => ({ ...row, [field]: row.key === key ? checked : checked ? false : row[field] })));
  }

  async function save() {
    const units: ProductUnitInputDto[] = [];
    for (const row of current) {
      const factor = Number(toWesternDigits(row.factor));
      if (!row.unitOfMeasureId || !Number.isFinite(factor) || factor <= 0) {
        toast.error(t('inventory.productUnits.invalidRow'));
        return;
      }
      let salePrice: ProductUnitInputDto['salePrice'] = null;
      let purchasePrice: ProductUnitInputDto['purchasePrice'] = null;
      try {
        if (row.salePrice.trim())
          salePrice = { amountMinorUnits: decimalToMinorUnits(toWesternDigits(row.salePrice)), currency };
        if (row.purchasePrice.trim())
          purchasePrice = { amountMinorUnits: decimalToMinorUnits(toWesternDigits(row.purchasePrice)), currency };
      } catch {
        toast.error(t('inventory.productUnits.invalidPrice'));
        return;
      }
      units.push({
        unitOfMeasureId: row.unitOfMeasureId,
        factor,
        salePrice,
        purchasePrice,
        isDefaultSale: row.isDefaultSale,
        isDefaultPurchase: row.isDefaultPurchase,
      });
    }
    try {
      await replace.mutateAsync(units);
      toast.success(t('inventory.productUnits.saved'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.productUnits.saveError'));
    }
  }

  if (isLoading) return <Skeleton className="h-32" />;

  if (product.trackingType === 'serial') {
    return <p className="text-sm text-muted-foreground">{t('inventory.productUnits.serialNote')}</p>;
  }

  const priceHint = (base: ProductDto['salePrice'], factorText: string) => {
    const factor = Number(toWesternDigits(factorText));
    if (!base || !(factor > 0)) return '';
    return formatAmount(multiplyMinorUnits(base.amountMinorUnits, String(factor)));
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t('inventory.productUnits.help', { base: baseUnit?.name ?? '' })}
      </p>
      {current.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inventory.productUnits.unit')}</TableHead>
              <TableHead className="w-28">
                {t('inventory.productUnits.factor', { base: baseUnit?.symbol ?? '' })}
              </TableHead>
              <TableHead className="w-32">{t('inventory.productUnits.salePrice')}</TableHead>
              <TableHead className="w-32">{t('inventory.productUnits.purchasePrice')}</TableHead>
              <TableHead className="w-24 text-center">{t('inventory.productUnits.defaultSale')}</TableHead>
              <TableHead className="w-24 text-center">{t('inventory.productUnits.defaultPurchase')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <Select
                    value={row.unitOfMeasureId}
                    onValueChange={(value) => update(row.key, { unitOfMeasureId: value })}
                  >
                    <SelectTrigger className="h-9" aria-label={t('inventory.productUnits.unit')}>
                      <SelectValue placeholder={t('documents.selectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name} ({unit.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-9 text-end"
                    inputMode="decimal"
                    aria-label={t('inventory.productUnits.factor', { base: baseUnit?.symbol ?? '' })}
                    value={row.factor}
                    onChange={(e) => update(row.key, { factor: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-9 text-end"
                    inputMode="decimal"
                    aria-label={t('inventory.productUnits.salePrice')}
                    placeholder={priceHint(product.salePrice, row.factor)}
                    value={row.salePrice}
                    onChange={(e) => update(row.key, { salePrice: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-9 text-end"
                    inputMode="decimal"
                    aria-label={t('inventory.productUnits.purchasePrice')}
                    placeholder={priceHint(product.purchasePrice, row.factor)}
                    value={row.purchasePrice}
                    onChange={(e) => update(row.key, { purchasePrice: e.target.value })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={row.isDefaultSale}
                    aria-label={t('inventory.productUnits.defaultSale')}
                    onCheckedChange={(checked) => setDefault(row.key, 'isDefaultSale', checked === true)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={row.isDefaultPurchase}
                    aria-label={t('inventory.productUnits.defaultPurchase')}
                    onCheckedChange={(checked) => setDefault(row.key, 'isDefaultPurchase', checked === true)}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('documents.removeLine')}
                    onClick={() => setRows(current.filter((candidate) => candidate.key !== row.key))}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t('inventory.productUnits.empty')}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows([
              ...current,
              {
                key: newKey(),
                unitOfMeasureId: '',
                factor: '',
                salePrice: '',
                purchasePrice: '',
                isDefaultSale: false,
                isDefaultPurchase: false,
              },
            ])
          }
        >
          <Plus />
          {t('inventory.productUnits.add')}
        </Button>
        <Button onClick={save} disabled={replace.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
