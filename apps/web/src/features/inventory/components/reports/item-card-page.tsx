import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useItemCard } from '../../api/reports/queries';
import { useVariantLookupMap } from '../../api/products/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { variantDisplayName } from '../../../../components/product/variant-search';
import { downloadCsv } from '../../../../lib/csv';
import { formatAmount } from '../../../../lib/money';
import { ALL_WAREHOUSES, WarehouseFilter } from './warehouse-filter';

function firstOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
}

/**
 * كارت الصنف: an item's opening balance at the start date, then every
 * movement in the period with the running balance — the report a
 * storekeeper and an auditor reconcile stock with.
 */
export function ItemCardPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const variantId = params.get('variant') ?? '';
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA'));
  const variants = useVariantLookupMap();
  const { data: warehouses } = useWarehouses();
  const warehouseName = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const variant = variants.get(variantId);
  const { data: card, isLoading } = useItemCard({
    productVariantId: variantId || undefined,
    warehouseId: warehouseId === ALL_WAREHOUSES ? undefined : warehouseId,
    from: from || undefined,
    to: to || undefined,
  });

  const documentLabel = (type: string | null, movementType: string) =>
    type
      ? t(`inventory.itemCard.references.${type}`, { defaultValue: type })
      : t(`inventory.itemCard.manual.${movementType}`);

  function exportCsv() {
    if (!card || !variant) return;
    downloadCsv(
      `${t('inventory.itemCard.title')} ${variant.sku}`,
      [
        t('inventory.itemCard.date'),
        t('inventory.itemCard.document'),
        t('inventory.itemCard.number'),
        t('documents.warehouse'),
        t('lots.lotNumber'),
        t('inventory.itemCard.in'),
        t('inventory.itemCard.out'),
        t('inventory.itemCard.balance'),
        t('inventory.itemCard.unitCost'),
      ],
      [
        ['', t('inventory.itemCard.opening'), '', '', '', '', '', card.openingQuantity, ''],
        ...card.movements.map((row) => [
          new Date(row.createdAt).toLocaleString('en-CA'),
          documentLabel(row.referenceType, row.movementType),
          row.referenceNumber ?? '',
          warehouseName.get(row.warehouseId) ?? '',
          row.lotNumber ?? '',
          row.quantity > 0 ? row.quantity : '',
          row.quantity < 0 ? -row.quantity : '',
          row.balance,
          row.unitCost ? formatAmount(row.unitCost.amountMinorUnits) : '',
        ]),
      ],
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.itemCard.title')}
        description={t('inventory.itemCard.description')}
        actions={
          card ? (
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                {t('inventory.reports.print')}
              </Button>
              <Button variant="outline" onClick={exportCsv}>
                <Download />
                {t('inventory.reports.exportCsv')}
              </Button>
            </div>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="grid min-w-72 gap-1">
          <span className="text-xs text-muted-foreground">{t('inventory.itemCard.item')}</span>
          <ProductVariantPicker
            activeOnly={false}
            value={variantId}
            onChange={(id) => setParams({ variant: id }, { replace: true })}
            filter={(candidate) => candidate.itemType !== 'service'}
          />
        </div>
        <WarehouseFilter value={warehouseId} onChange={setWarehouseId} />
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t('inventory.itemCard.from')}</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t('inventory.itemCard.to')}</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {!variantId ? (
        <EmptyState className="py-12" icon={<FileSpreadsheet />} title={t('inventory.itemCard.pick')} />
      ) : isLoading || !card ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <div className="hidden print:block">
            <h2 className="text-lg font-semibold">
              {t('inventory.itemCard.title')} — {variant ? variantDisplayName(variant) : ''} ({variant?.sku})
            </h2>
            <p className="text-sm">
              {from} → {to}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label={t('inventory.itemCard.opening')} value={card.openingQuantity} />
            <Summary label={t('inventory.itemCard.totalIn')} value={card.totalIn} />
            <Summary label={t('inventory.itemCard.totalOut')} value={card.totalOut} />
            <Summary label={t('inventory.itemCard.closing')} value={card.closingQuantity} strong />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.itemCard.date')}</TableHead>
                    <TableHead>{t('inventory.itemCard.document')}</TableHead>
                    <TableHead>{t('documents.warehouse')}</TableHead>
                    <TableHead>{t('lots.lotNumber')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.in')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.out')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.balance')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.unitCost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={6} className="font-medium">
                      {t('inventory.itemCard.opening')}
                    </TableCell>
                    <TableCell className="text-end font-semibold">{card.openingQuantity}</TableCell>
                    <TableCell />
                  </TableRow>
                  {card.movements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        <bdi dir="ltr">
                          {new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                        </bdi>
                      </TableCell>
                      <TableCell>
                        {documentLabel(row.referenceType, row.movementType)}
                        {row.referenceNumber ? (
                          <span dir="ltr" className="px-2 font-mono text-xs text-muted-foreground">
                            {row.referenceNumber}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{warehouseName.get(row.warehouseId) ?? '—'}</TableCell>
                      <TableCell dir="ltr" className="text-end font-mono text-xs">
                        {row.lotNumber ?? ''}
                      </TableCell>
                      <TableCell className="text-end text-emerald-600">
                        {row.quantity > 0 ? row.quantity : ''}
                      </TableCell>
                      <TableCell className="text-end text-destructive">
                        {row.quantity < 0 ? -row.quantity : ''}
                      </TableCell>
                      <TableCell className="text-end font-medium">{row.balance}</TableCell>
                      <TableCell className="text-end text-muted-foreground">
                        {row.unitCost ? formatAmount(row.unitCost.amountMinorUnits) : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {card.movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        {t('inventory.itemCard.noMovements')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              {card.truncated ? <p className="p-3 text-xs text-warning">{t('inventory.itemCard.truncated')}</p> : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? 'text-xl font-bold' : 'text-xl font-semibold'}>{value}</div>
    </div>
  );
}
