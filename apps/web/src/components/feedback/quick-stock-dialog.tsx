import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PackagePlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  usePermissions,
} from '@erp-platform/ui';

import { ApiError, apiPost, onApiError } from '../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../lib/money';
import { hasAny, INV } from '../../lib/permissions';
import { useVariantLookupMap } from '../../features/inventory/api/products/queries';

interface Shortage {
  productVariantId: string;
  name: string;
  requested: number;
  available: number;
}

interface Offer {
  warehouseId: string;
  shortages: Shortage[];
}

interface Row extends Shortage {
  add: string;
  cost: string;
}

/**
 * Stock never goes negative. When a sale / delivery is refused for lack of
 * stock, this offers to fix the stock on the spot: a user allowed to adjust
 * stock adds the missing quantity (one posted stock adjustment, kept with
 * their name and the reason) and then repeats the sale. Others see what is
 * missing and who can fix it. Mounted once in AppProviders; reacts to any
 * DELIVERY.INSUFFICIENT_STOCK (sales, POS, invoices that deliver) carrying the shortages (lot-tracked items
 * are left out — they need lot numbers).
 */
export function QuickStockDialogHost() {
  const { t } = useTranslation();
  const granted = usePermissions();
  const canAdjust = hasAny(granted, INV.movementsManage);
  const queryClient = useQueryClient();
  const [offer, setOffer] = useState<Offer | null>(null);
  // Only loaded once an offer shows up (the host is mounted on every page, login included).
  const variants = useVariantLookupMap(offer !== null);
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onApiError((body) => {
        const b = body as { code?: string; data?: Partial<Offer> } | null;
        if (b?.code !== 'DELIVERY.INSUFFICIENT_STOCK' || !b.data?.warehouseId || !b.data.shortages?.length) return;
        setOffer({ warehouseId: b.data.warehouseId, shortages: b.data.shortages });
      }),
    [],
  );

  useEffect(() => {
    if (!offer) return;
    setReason(t('quickStock.defaultReason'));
    setRows(
      offer.shortages.map((s) => {
        const price = variants.get(s.productVariantId)?.purchasePrice;
        return {
          ...s,
          add: String(Math.max(0, Math.round((s.requested - s.available) * 10_000) / 10_000)),
          cost: price ? minorUnitsToDecimalString(price.amountMinorUnits) : '',
        };
      }),
    );
    // A new offer, or the catalogue (purchase prices) arriving for it.
  }, [offer, variants]);

  const label = (s: Shortage) => {
    const v = variants.get(s.productVariantId);
    const attrs = v ? Object.values(v.attributeValues).map(String).filter(Boolean).join(' / ') : '';
    return attrs ? `${s.name} — ${attrs}` : s.name;
  };

  async function addStock() {
    if (!offer) return;
    const lines = [];
    for (const row of rows) {
      const quantity = Number(row.add);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      let unitCost = null;
      if (row.cost.trim()) {
        try {
          unitCost = { amountMinorUnits: decimalToMinorUnits(row.cost.trim()), currency: variants.get(row.productVariantId)?.purchasePrice?.currency ?? 'EGP' };
        } catch {
          toast.error(t('quickStock.invalidCost'));
          return;
        }
      }
      lines.push({ productVariantId: row.productVariantId, direction: 'increase' as const, quantity, unitCost, notes: reason || null });
    }
    if (lines.length === 0) return;
    setBusy(true);
    try {
      await apiPost('/stock-adjustments', { warehouseId: offer.warehouseId, notes: reason || null, lines, post: true });
      await Promise.all(['stock', 'stock-adjustments', 'products'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      toast.success(t('quickStock.added'));
      setOffer(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={offer !== null} onOpenChange={(open) => !open && setOffer(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-warning" aria-hidden="true" />
            {t('quickStock.title')}
          </DialogTitle>
          <DialogDescription>{canAdjust ? t('quickStock.hint') : t('quickStock.noPermission')}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('quickStock.item')}</TableHead>
              <TableHead>{t('quickStock.requested')}</TableHead>
              <TableHead>{t('quickStock.available')}</TableHead>
              {canAdjust ? <TableHead>{t('quickStock.add')}</TableHead> : null}
              {canAdjust ? <TableHead>{t('quickStock.cost')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.productVariantId}>
                <TableCell className="font-medium">{label(row)}</TableCell>
                <TableCell className="tabular">{row.requested}</TableCell>
                <TableCell className="tabular text-danger">{row.available}</TableCell>
                {canAdjust ? (
                  <TableCell>
                    <Input
                      className="h-8 w-20 text-end"
                      dir="ltr"
                      inputMode="decimal"
                      value={row.add}
                      onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, add: e.target.value } : r)))}
                    />
                  </TableCell>
                ) : null}
                {canAdjust ? (
                  <TableCell>
                    <Input
                      className="h-8 w-24 text-end"
                      dir="ltr"
                      inputMode="decimal"
                      value={row.cost}
                      placeholder={t('quickStock.costPlaceholder')}
                      onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, cost: e.target.value } : r)))}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {canAdjust ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('quickStock.reason')}</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOffer(null)}>
            {t('common.back')}
          </Button>
          {canAdjust ? (
            <Button onClick={() => void addStock()} disabled={busy || !reason.trim()}>
              {t('quickStock.addButton')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
