import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, Tags, Trash2 } from 'lucide-react';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';

import { useVariantLookupMap } from '../../api/products/queries';
import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { variantDisplayName } from '../../../../components/product/variant-search';
import { BarcodeSvg } from '../../../../components/product/barcode-svg';
import { canEncodeCode128 } from '../../../../lib/barcode';
import { formatMoney } from '../../../../lib/money';
import { toWesternDigits } from '../../../../lib/search-normalize';

/** Label stock: a thermal roll (one label per printed page) or an A4 sheet grid. */
const LAYOUTS = {
  roll38x25: { kind: 'roll', widthMm: 38, heightMm: 25 },
  roll50x30: { kind: 'roll', widthMm: 50, heightMm: 30 },
  a4x24: { kind: 'sheet', widthMm: 70, heightMm: 37, columns: 3 },
} as const;
type LayoutKey = keyof typeof LAYOUTS;

interface LabelLine {
  variantId: string;
  copies: string;
}

/** The code printed on a label: the barcode, else an ASCII SKU (Code 128), else nothing scannable. */
function labelCode(variant: ProductVariantLookupDto): string | null {
  if (variant.barcode) return variant.barcode;
  return canEncodeCode128(variant.sku) ? variant.sku : null;
}

/**
 * Barcode labels: pick items and copies, choose the label stock, print. The
 * print area is portalled to <body> and everything else is hidden with
 * @media print, with @page sized to the chosen label so thermal printers get
 * one label per page.
 */
export function LabelsPage() {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();
  const [lines, setLines] = useState<LabelLine[]>([]);
  const [layout, setLayout] = useState<LayoutKey>('roll38x25');
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);

  const labels = useMemo(
    () =>
      lines.flatMap((line) => {
        const variant = variants.get(line.variantId);
        const copies = Math.min(Math.max(Math.floor(Number(toWesternDigits(line.copies)) || 0), 0), 500);
        return variant ? Array.from({ length: copies }, (_, index) => ({ key: `${line.variantId}-${index}`, variant })) : [];
      }),
    [lines, variants],
  );

  const spec = LAYOUTS[layout];
  const pageCss =
    spec.kind === 'roll'
      ? `@page { size: ${spec.widthMm}mm ${spec.heightMm}mm; margin: 0; }`
      : '@page { size: A4; margin: 8mm 0 0 0; }';

  function addVariant(variantId: string) {
    setLines((prev) =>
      prev.some((line) => line.variantId === variantId) ? prev : [...prev, { variantId, copies: '1' }],
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.labels.title')}
        description={t('inventory.labels.description')}
        actions={
          <Button onClick={() => window.print()} disabled={labels.length === 0}>
            <Printer />
            {t('inventory.labels.print', { count: labels.length })}
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('inventory.labels.items')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ProductVariantPicker value="" onChange={(id) => addVariant(id)} />
            {lines.length === 0 ? (
              <EmptyState icon={<Tags />} title={t('inventory.labels.empty')} />
            ) : (
              <ul className="divide-y rounded-lg border">
                {lines.map((line) => {
                  const variant = variants.get(line.variantId);
                  if (!variant) return null;
                  const code = labelCode(variant);
                  return (
                    <li key={line.variantId} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{variantDisplayName(variant)}</p>
                        <p className="truncate text-xs text-muted-foreground" dir="ltr">
                          {code ?? t('inventory.labels.noCode')}
                        </p>
                      </div>
                      <Input
                        className="h-9 w-20 text-end"
                        inputMode="numeric"
                        aria-label={t('inventory.labels.copies')}
                        value={line.copies}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((entry) =>
                              entry.variantId === line.variantId ? { ...entry, copies: e.target.value } : entry,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        onClick={() => setLines((prev) => prev.filter((entry) => entry.variantId !== line.variantId))}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('inventory.labels.options')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">{t('inventory.labels.layout')}</label>
              <Select value={layout} onValueChange={(value) => setLayout(value as LayoutKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roll38x25">{t('inventory.labels.roll38x25')}</SelectItem>
                  <SelectItem value="roll50x30">{t('inventory.labels.roll50x30')}</SelectItem>
                  <SelectItem value="a4x24">{t('inventory.labels.a4x24')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showName} onCheckedChange={(checked) => setShowName(checked === true)} />
              {t('inventory.labels.showName')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showPrice} onCheckedChange={(checked) => setShowPrice(checked === true)} />
              {t('inventory.labels.showPrice')}
            </label>
            {labels[0] ? (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">{t('inventory.labels.preview')}</span>
                <div className="flex justify-center rounded-lg border bg-subtle p-4">
                  <Label
                    variant={labels[0].variant}
                    widthMm={spec.widthMm}
                    heightMm={spec.heightMm}
                    showName={showName}
                    showPrice={showPrice}
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {createPortal(
        <div className="label-print-area" aria-hidden="true">
          <style>{`
            .label-print-area { display: none; }
            @media print {
              ${pageCss}
              body > *:not(.label-print-area) { display: none !important; }
              .label-print-area { display: block; }
              .label-print-area .label-grid { display: grid; grid-template-columns: repeat(${spec.kind === 'sheet' ? spec.columns : 1}, ${spec.widthMm}mm); justify-content: center; }
              .label-print-area .label { break-inside: avoid; ${spec.kind === 'roll' ? 'break-after: page;' : ''} }
            }
          `}</style>
          <div className="label-grid">
            {labels.map((label) => (
              <Label
                key={label.key}
                variant={label.variant}
                widthMm={spec.widthMm}
                heightMm={spec.heightMm}
                showName={showName}
                showPrice={showPrice}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Label({
  variant,
  widthMm,
  heightMm,
  showName,
  showPrice,
}: {
  variant: ProductVariantLookupDto;
  widthMm: number;
  heightMm: number;
  showName: boolean;
  showPrice: boolean;
}) {
  const code = labelCode(variant);
  return (
    <div
      className="label flex flex-col items-center justify-center overflow-hidden bg-white px-[1.5mm] py-[1mm] text-black"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }}
    >
      {showName ? (
        <p className="w-full truncate text-center text-[8pt] font-semibold leading-tight">{variantDisplayName(variant)}</p>
      ) : null}
      {code ? <BarcodeSvg value={code} height={36} className="my-[0.5mm] min-h-0 w-full flex-1" /> : null}
      {showPrice && variant.salePrice ? (
        <p className="text-[9pt] font-bold leading-tight" dir="ltr">
          {formatMoney(variant.salePrice.amountMinorUnits, variant.salePrice.currency)}
        </p>
      ) : null}
    </div>
  );
}
