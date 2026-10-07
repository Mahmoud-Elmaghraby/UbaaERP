import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ScanSearch, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

import { useLotTrace } from '../../api/reports/queries';
import { useLocationLookups } from '../../hooks/stock/use-location-lookups';
import { DocumentReference } from '../document-reference';

/**
 * Lot / serial trace (تتبع التشغيلة): type a lot or serial number and see
 * which supplier it came from, every warehouse it passed through, and which
 * customers received it — the recall question a pharmacy, food or
 * electronics business must answer in minutes.
 */
export function LotTracePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const lotNumber = params.get('lot') ?? '';
  const [draft, setDraft] = useState(lotNumber);
  const { data, isLoading, isFetched } = useLotTrace(lotNumber);
  const { warehouseById, locationById } = useLocationLookups();

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    setParams(value ? { lot: value } : {});
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.lotTrace.title')} description={t('inventory.lotTrace.description')} />

      <form onSubmit={submit} className="flex max-w-xl items-end gap-2">
        <div className="grid flex-1 gap-1">
          <span className="text-xs text-muted-foreground">{t('inventory.lotTrace.lotNumber')}</span>
          <Input
            dir="ltr"
            autoFocus
            value={draft}
            placeholder={t('inventory.lotTrace.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button type="submit">
          <Search className="size-4" />
          {t('inventory.lotTrace.search')}
        </Button>
      </form>

      {!lotNumber ? (
        <EmptyState icon={<ScanSearch className="size-8" />} title={t('inventory.lotTrace.pick')} />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isFetched && (data ?? []).length === 0 ? (
        <EmptyState icon={<ScanSearch className="size-8" />} title={t('inventory.lotTrace.notFound', { lot: lotNumber })} />
      ) : (
        (data ?? []).map((lot) => (
          <Card key={lot.stockLotId}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {lot.productName}{' '}
                <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {lot.sku}
                </span>
              </CardTitle>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" dir="ltr" className="font-mono">
                  {lot.lotNumber}
                </Badge>
                {lot.expiryDate ? (
                  <Badge variant="secondary">
                    {t('inventory.lotTrace.expiry')}: {new Date(lot.expiryDate).toLocaleDateString('ar-EG')}
                  </Badge>
                ) : null}
                <Badge variant="secondary">
                  {t('inventory.lotTrace.in')}: {lot.received}
                </Badge>
                <Badge variant="secondary">
                  {t('inventory.lotTrace.out')}: {lot.shipped}
                </Badge>
                <Badge>
                  {t('inventory.lotTrace.onHand')}: {lot.quantityOnHand}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.itemCard.date')}</TableHead>
                    <TableHead>{t('inventory.itemCard.document')}</TableHead>
                    <TableHead>{t('inventory.lotTrace.where')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.in')}</TableHead>
                    <TableHead className="text-end">{t('inventory.itemCard.out')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lot.movements.map((movement) => (
                    <TableRow key={`${movement.id}-${movement.quantity}`}>
                      <TableCell className="whitespace-nowrap">
                        <bdi dir="ltr">
                          {new Date(movement.createdAt).toLocaleString('en-GB', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </bdi>
                      </TableCell>
                      <TableCell>
                        <DocumentReference {...movement} />
                      </TableCell>
                      <TableCell>
                        {warehouseById.get(movement.warehouseId)?.name ?? '—'} /{' '}
                        {locationById.get(movement.locationId)?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-end text-emerald-600">
                        {movement.quantity > 0 ? movement.quantity : ''}
                      </TableCell>
                      <TableCell className="text-end text-rose-600">
                        {movement.quantity < 0 ? -movement.quantity : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
