import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpsertStockCountLineDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@erp-platform/ui';

import { useVariantLookup } from '../../api/products/queries';
import { resolveScan, variantDisplayName } from '../../../../components/product/variant-search';
import { parsePastedTable } from '../../../../lib/csv';
import { decimalToMinorUnits } from '../../../../lib/money';
import { toWesternDigits } from '../../../../lib/search-normalize';

interface ParsedRow {
  row: number;
  name: string;
  line?: UpsertStockCountLineDto;
  error?: string;
}

const PREVIEW_LIMIT = 200;

/** Normalizes a pasted date: YYYY-MM-DD, DD/MM/YYYY or D-M-YYYY → YYYY-MM-DD. */
function parseDate(text: string): string | null | undefined {
  const value = toWesternDigits(text).trim();
  if (!value) return null;
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  if (match) return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return undefined;
}

/**
 * Bulk entry by pasting cells copied from Excel / Google Sheets:
 * code-or-barcode | quantity | unit cost | lot | expiry. A header row is
 * skipped automatically; rows with the same item and lot are added up.
 */
export function PasteLinesDialog({
  open,
  onOpenChange,
  isOpening,
  currency,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOpening: boolean;
  currency: string;
  onImport: (lines: UpsertStockCountLineDto[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { data: variants } = useVariantLookup();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo<ParsedRow[]>(() => {
    const table = parsePastedTable(text);
    const rows: ParsedRow[] = [];
    table.forEach((cells, index) => {
      const [code = '', quantityText = '', costText = '', lotText = '', expiryText = ''] = cells;
      const quantity = Number(toWesternDigits(quantityText).replace(/[٫,]/g, '.'));
      if (index === 0 && !Number.isFinite(quantity)) return; // header row
      const row: ParsedRow = { row: index + 1, name: code };
      const scan = resolveScan(variants ?? [], toWesternDigits(code));
      if (!scan) {
        rows.push({ ...row, error: t('inventory.counts.pasteErrors.unknownItem') });
        return;
      }
      row.name = variantDisplayName(scan.variant);
      if (!quantityText.trim() || !Number.isFinite(quantity) || quantity < 0) {
        rows.push({ ...row, error: t('inventory.counts.pasteErrors.badQuantity') });
        return;
      }
      const tracked = scan.variant.trackingType !== 'none';
      const lotNumber = toWesternDigits(lotText).trim();
      if (tracked && !lotNumber) {
        rows.push({ ...row, error: t('inventory.counts.pasteErrors.lotRequired') });
        return;
      }
      const expiryDate = parseDate(expiryText);
      if (expiryDate === undefined) {
        rows.push({ ...row, error: t('inventory.counts.pasteErrors.badDate') });
        return;
      }
      let unitCost: UpsertStockCountLineDto['unitCost'] = null;
      if (costText.trim()) {
        try {
          unitCost = { amountMinorUnits: decimalToMinorUnits(toWesternDigits(costText).replace(/,/g, '')), currency };
        } catch {
          rows.push({ ...row, error: t('inventory.counts.pasteErrors.badCost') });
          return;
        }
      } else if (isOpening) {
        const price = scan.variant.purchasePrice;
        if (price && price.currency === currency) unitCost = price;
        else {
          rows.push({ ...row, error: t('inventory.counts.pasteErrors.costRequired') });
          return;
        }
      }
      rows.push({
        ...row,
        line: {
          productVariantId: scan.variant.id,
          lotNumber: tracked ? lotNumber : null,
          expiryDate: tracked ? expiryDate : null,
          countedQuantity: quantity * scan.quantity,
          unitCost,
        },
      });
    });
    return rows;
  }, [text, variants, currency, isOpening, t]);

  const valid = parsed.filter((row) => row.line);
  const invalid = parsed.filter((row) => row.error);

  async function importRows() {
    const merged = new Map<string, UpsertStockCountLineDto>();
    for (const { line } of valid) {
      const key = `${line!.productVariantId}|${line!.lotNumber ?? ''}`;
      const existing = merged.get(key);
      if (existing) existing.countedQuantity = (existing.countedQuantity ?? 0) + (line!.countedQuantity ?? 0);
      else merged.set(key, { ...line! });
    }
    setBusy(true);
    const ok = await onImport([...merged.values()]);
    setBusy(false);
    if (ok) {
      setText('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('inventory.counts.paste')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {isOpening ? t('inventory.counts.pasteHelpOpening') : t('inventory.counts.pasteHelp')}
          </p>
          <Textarea
            rows={6}
            dir="ltr"
            className="font-mono text-xs"
            placeholder={'6221000000017\t120\t25.50\n6221000000048\t40\t510\tB-2401\t2027-03-31'}
            aria-label={t('inventory.counts.paste')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {parsed.length > 0 ? (
            <>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-600">{t('inventory.counts.pasteValid', { count: valid.length })}</span>
                {invalid.length > 0 ? (
                  <span className="text-destructive">
                    {t('inventory.counts.pasteInvalid', { count: invalid.length })}
                  </span>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                      <TableHead className="w-24">{t('inventory.counts.counted')}</TableHead>
                      <TableHead>{t('lots.lotNumber')}</TableHead>
                      <TableHead>{t('inventory.counts.pasteStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, PREVIEW_LIMIT).map((row) => (
                      <TableRow key={row.row}>
                        <TableCell>{row.row}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.line?.countedQuantity ?? ''}</TableCell>
                        <TableCell dir="ltr">{row.line?.lotNumber ?? ''}</TableCell>
                        <TableCell className={row.error ? 'text-destructive' : 'text-emerald-600'}>
                          {row.error ?? '✓'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
          <Button onClick={importRows} disabled={valid.length === 0 || busy}>
            {t('inventory.counts.pasteImport', { count: valid.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
