import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WarehouseDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';
import { ArrowLeftRight, Boxes, FileQuestion, Pencil, Trash2 } from 'lucide-react';

import { useBranches } from '../../../settings/queries';
import { useDeleteWarehouse, useWarehouses } from '../../api/warehouses/queries';
import { useStockLevels } from '../../api/stock/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';
import { multiplyMinorUnits } from '../../../../lib/money';
import { formatQuantity } from '../../../../components/report/report-format';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { WarehouseLocationsSection } from './warehouse-locations-section';
import { WAREHOUSES_PATH } from './warehouse-paths';

const TOP_ITEMS = 10;

/** /inventory/warehouses/:id — the warehouse, its storage locations and what it holds. */
export function WarehousePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: warehouses, isLoading } = useWarehouses();
  const warehouse = warehouses?.find((w) => w.id === id);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!warehouse) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={WAREHOUSES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }
  return <WarehouseDetails warehouse={warehouse} />;
}

interface ItemRow {
  variantId: string;
  productId: string | null;
  name: string;
  sku: string;
  quantity: number;
  value: bigint | null;
  low: boolean;
}

function WarehouseDetails({ warehouse }: { warehouse: WarehouseDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: branches } = useBranches();
  const { data: levels, isLoading: levelsLoading } = useStockLevels({ warehouseId: warehouse.id });
  const variantIndex = useVariantIndex();
  const deleteWarehouse = useDeleteWarehouse();
  const branch = warehouse.branchId ? branches?.find((b) => b.id === warehouse.branchId)?.name : null;

  const summary = useMemo(() => {
    const byLocation = new Map<string, number>();
    const byVariant = new Map<string, ItemRow>();
    let hasCost = false;
    for (const level of levels ?? []) {
      byLocation.set(level.locationId, (byLocation.get(level.locationId) ?? 0) + level.quantityOnHand);
      const entry = variantIndex.get(level.productVariantId);
      const row = byVariant.get(level.productVariantId) ?? {
        variantId: level.productVariantId,
        productId: entry?.productId ?? null,
        name: entry?.productName ?? '—',
        sku: entry?.sku ?? '',
        quantity: 0,
        value: null,
        low: false,
      };
      row.quantity += level.quantityOnHand;
      if (level.averageCost) {
        hasCost = true;
        row.value = (row.value ?? 0n) + BigInt(multiplyMinorUnits(level.averageCost.amountMinorUnits, String(level.quantityOnHand)));
      }
      if (level.reorderPoint !== null && level.quantityOnHand <= level.reorderPoint) row.low = true;
      byVariant.set(level.productVariantId, row);
    }
    const items = [...byVariant.values()].filter((row) => row.quantity !== 0);
    const top = [...items]
      .sort((a, b) => (hasCost ? Number((b.value ?? 0n) - (a.value ?? 0n)) : b.quantity - a.quantity))
      .slice(0, TOP_ITEMS);
    return {
      byLocation,
      top,
      hasCost,
      itemCount: items.length,
      totalQuantity: items.reduce((sum, row) => sum + row.quantity, 0),
      totalValue: items.reduce((sum, row) => sum + (row.value ?? 0n), 0n),
      lowCount: [...byVariant.values()].filter((row) => row.low).length,
    };
  }, [levels, variantIndex]);

  async function handleDelete() {
    if (!(await confirmDialog(t('inventory.warehouses.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteWarehouse.mutateAsync(warehouse.id);
      toast.success(t('inventory.warehouses.deleteSuccess'));
      navigate(WAREHOUSES_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={WAREHOUSES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.warehouses')}
        title={warehouse.name}
        status={
          <Badge variant={warehouse.isActive ? 'success' : 'neutral'} dot>
            {warehouse.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/inventory/stock?warehouse=${warehouse.id}`}>
                <Boxes />
                {t('inventory.warehouses.viewStock')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/inventory/stock?view=movements&warehouse=${warehouse.id}`}>
                <ArrowLeftRight />
                {t('inventory.warehouses.viewMovements')}
              </Link>
            </Button>
            <Can permission={INV.settingsManage}>
              <>
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deleteWarehouse.isPending}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 />
                  {t('common.delete')}
                </Button>
                <Button asChild>
                  <Link to={`${WAREHOUSES_PATH}/${warehouse.id}/edit`}>
                    <Pencil />
                    {t('common.edit')}
                  </Link>
                </Button>
              </>
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('inventory.warehouses.code'), value: <span className="tabular" dir="ltr">{warehouse.code}</span> },
                  { label: t('inventory.warehouses.branch'), value: branch ?? t('inventory.warehouses.noBranch') },
                  ...(warehouse.address ? [{ label: t('inventory.warehouses.address'), value: warehouse.address, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <WarehouseLocationsSection warehouse={warehouse} onHandByLocation={summary.byLocation} />

            <SectionCard
              title={t('inventory.warehouses.topItems')}
              description={summary.hasCost ? t('inventory.warehouses.topItemsByValue') : t('inventory.warehouses.topItemsByQuantity')}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('inventory.stock.product')}</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-end">{t('inventory.products.onHand')}</TableHead>
                    {summary.hasCost ? <TableHead className="text-end">{t('inventory.products.stockValue')}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.top.map((row) => (
                    <TableRow
                      key={row.variantId}
                      className={row.productId ? 'cursor-pointer' : undefined}
                      onClick={() => row.productId && navigate(`/inventory/products/${row.productId}`)}
                    >
                      <TableCell className="font-medium">
                        {row.name}
                        {row.low ? <Badge variant="warning" className="ms-2">{t('inventory.warehouses.belowReorder')}</Badge> : null}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground" dir="ltr">{row.sku}</TableCell>
                      <TableCell className={`${AMOUNT_CELL} ${row.quantity < 0 ? 'text-danger' : ''}`}>{formatQuantity(row.quantity)}</TableCell>
                      {summary.hasCost ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={(row.value ?? 0n).toString()} hideCurrency />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {!levelsLoading && summary.top.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        {t('inventory.products.noStock')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={
          <TotalsPanel
            title={t('inventory.warehouses.stockSummary')}
            rows={[
              { label: t('inventory.warehouses.itemCount'), value: levelsLoading ? '…' : formatQuantity(summary.itemCount) },
              { label: t('inventory.warehouses.totalQuantity'), value: levelsLoading ? '…' : formatQuantity(summary.totalQuantity) },
              {
                label: t('inventory.warehouses.lowCount'),
                value: summary.lowCount > 0 ? (
                  <Link to="/inventory/low-stock" className="font-medium text-warning hover:underline">
                    {formatQuantity(summary.lowCount)}
                  </Link>
                ) : (
                  '0'
                ),
              },
            ]}
            totalLabel={summary.hasCost ? t('inventory.products.stockValue') : t('inventory.warehouses.totalQuantity')}
            totalValue={
              summary.hasCost ? <Amount value={summary.totalValue.toString()} hideCurrency /> : formatQuantity(summary.totalQuantity)
            }
          />
        }
      />
    </div>
  );
}
