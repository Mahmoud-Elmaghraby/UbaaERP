import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardEdit, Plus } from 'lucide-react';
import type { StockAdjustmentStatusDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@erp-platform/ui';

import { useAdjustmentReasons, useStockAdjustments } from '../../api/stock-documents/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { INV } from '../../../../lib/permissions';
import { ADJUSTMENT_STATUS_VARIANT, ADJUSTMENTS_PATH } from '../../lib/document-status';

const TABS = ['all', 'draft', 'posted', 'cancelled'] as const;

/** تسويات المخزون — every manual stock change, numbered (ADJ-). */
export function StockAdjustmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('status') ?? '') ? params.get('status')! : 'all';
  const { data: adjustments, isLoading } = useStockAdjustments(
    tab === 'all' ? undefined : (tab as StockAdjustmentStatusDto),
  );
  const { data: warehouses } = useWarehouses();
  const { data: reasons } = useAdjustmentReasons();
  const warehouseName = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const reasonName = new Map((reasons ?? []).map((reason) => [reason.id, reason.name]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.adjustments.title')}
        description={t('inventory.adjustments.description')}
        actions={
          <Can permission={INV.movementsManage}>
            <Button onClick={() => navigate(`${ADJUSTMENTS_PATH}/new`)}>
              <Plus />
              {t('inventory.adjustments.new')}
            </Button>
          </Can>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setParams(value === 'all' ? {} : { status: value }, { replace: true })}>
        <TabsList>
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {value === 'all' ? t('common.all') : t(`inventory.adjustments.statuses.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (adjustments ?? []).length === 0 ? (
            <EmptyState className="py-12" icon={<ClipboardEdit />} title={t('inventory.adjustments.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.adjustments.number')}</TableHead>
                    <TableHead>{t('documents.warehouse')}</TableHead>
                    <TableHead>{t('inventory.documents.reason')}</TableHead>
                    <TableHead>{t('inventory.transfers.date')}</TableHead>
                    <TableHead>{t('inventory.transfers.status')}</TableHead>
                    <TableHead>{t('documents.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(adjustments ?? []).map((adjustment) => (
                    <TableRow key={adjustment.id}>
                      <TableCell className="font-medium">
                        <Link className="text-primary hover:underline" to={`${ADJUSTMENTS_PATH}/${adjustment.id}`}>
                          {adjustment.adjustmentNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{warehouseName.get(adjustment.warehouseId) ?? '—'}</TableCell>
                      <TableCell>{adjustment.reasonId ? (reasonName.get(adjustment.reasonId) ?? '—') : '—'}</TableCell>
                      <TableCell dir="ltr" className="text-end">
                        {adjustment.adjustmentDate}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ADJUSTMENT_STATUS_VARIANT[adjustment.status]} dot>
                          {t(`inventory.adjustments.statuses.${adjustment.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">{adjustment.notes ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
