import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@erp-platform/ui';

import { normalizeForSearch } from '../../lib/search-normalize';

export interface GridLine {
  productVariantId: string;
  quantity: string;
  unitPrice: string;
}

interface ProductOption {
  productId: string;
  code: string;
  name: string;
  variants: ProductVariantLookupDto[];
}

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

/**
 * One model, all its sizes × colours at once (clothing: a factory delivers a model in every size
 * and colour). Rows = the first option's values, columns = the second's (any further option joins
 * the row label); one quantity per cell, one price for the whole model (editable). Cells with no
 * quantity are skipped; each filled cell becomes one document line.
 */
export function VariantGridDialog({
  open,
  onOpenChange,
  variants,
  priceOf,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: ReadonlyMap<string, ProductVariantLookupDto>;
  /** The default price of one piece of a variant (the document's price list / the item price). */
  priceOf: (variant: ProductVariantLookupDto) => string | null;
  onAdd: (lines: GridLine[]) => void;
}) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [price, setPrice] = useState('');

  // Only products with more than one variant need a grid.
  const products = useMemo(() => {
    const byProduct = new Map<string, ProductOption>();
    for (const variant of variants.values()) {
      if (!variant.isActive || !variant.productIsActive) continue;
      const entry = byProduct.get(variant.productId) ?? { productId: variant.productId, code: variant.productCode, name: variant.productName, variants: [] };
      entry.variants.push(variant);
      byProduct.set(variant.productId, entry);
    }
    return [...byProduct.values()].filter((p) => p.variants.length > 1).sort((a, b) => a.code.localeCompare(b.code));
  }, [variants]);
  const product = products.find((p) => p.productId === productId);

  const grid = useMemo(() => {
    if (!product) return null;
    const names = [...new Set(product.variants.flatMap((v) => Object.keys(v.attributeValues ?? {})))];
    const [colName, ...rowNames] = names.length > 1 ? [names[names.length - 1]!, ...names.slice(0, -1)] : [undefined, ...names];
    const rowOf = (v: ProductVariantLookupDto) => rowNames.map((n) => text(v.attributeValues?.[n])).join(' / ') || product.name;
    const colOf = (v: ProductVariantLookupDto) => (colName ? text(v.attributeValues?.[colName]) : '');
    const rows = [...new Set(product.variants.map(rowOf))];
    const cols = [...new Set(product.variants.map(colOf))];
    const cell = new Map(product.variants.map((v) => [`${rowOf(v)}|${colOf(v)}`, v]));
    return { rowTitle: rowNames.join(' / '), colTitle: colName, rows, cols, cell };
  }, [product]);

  function pick(id: string) {
    setProductId(id);
    setQuantities({});
    const first = products.find((p) => p.productId === id)?.variants[0];
    setPrice(first ? (priceOf(first) ?? '') : '');
  }

  const filled = Object.entries(quantities).filter(([, q]) => Number(q) > 0);
  const total = filled.reduce((sum, [, q]) => sum + Number(q), 0);

  function add() {
    onAdd(filled.map(([variantId, quantity]) => ({ productVariantId: variantId, quantity, unitPrice: price })));
    setProductId('');
    setQuantities({});
    setPrice('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('documents.grid.title')}</DialogTitle>
          <DialogDescription>{t('documents.grid.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1">
              <span className="text-sm font-medium">{t('documents.grid.model')}</span>
              <Combobox
                className="h-10"
                items={products}
                value={productId}
                getValue={(p) => p.productId}
                getLabel={(p) => `${p.name} · ${p.code}`}
                search={(items, query) => {
                  const needle = normalizeForSearch(query);
                  return items.filter((p) => normalizeForSearch(`${p.name} ${p.code}`).includes(needle));
                }}
                onValueChange={pick}
                placeholder={t('documents.grid.pickModel')}
              />
            </div>
            {product ? (
              <div className="grid gap-1">
                <span className="text-sm font-medium">{t('documents.grid.price')}</span>
                <Input className="h-10 w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            ) : null}
          </div>

          {grid ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{grid.rowTitle}</th>
                    {grid.cols.map((col) => (
                      <th key={col} className="px-2 py-2 text-center font-medium">
                        {col || t('documents.quantity')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{row}</td>
                      {grid.cols.map((col) => {
                        const variant = grid.cell.get(`${row}|${col}`);
                        return (
                          <td key={col} className="px-1 py-1 text-center">
                            {variant ? (
                              <Input
                                className="h-9 w-20 text-center tabular-nums"
                                inputMode="decimal"
                                placeholder="0"
                                aria-label={`${row} ${col}`}
                                value={quantities[variant.id] ?? ''}
                                onChange={(e) => setQuantities((prev) => ({ ...prev, [variant.id]: e.target.value }))}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('documents.grid.noModels')}</p>
          ) : null}
        </div>
        <DialogFooter className="items-center gap-3">
          {filled.length ? <span className="text-sm text-muted-foreground">{t('documents.grid.summary', { lines: filled.length, pieces: total })}</span> : null}
          <Button onClick={add} disabled={filled.length === 0 || !price.trim()}>
            {t('documents.grid.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
