import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import type { StockTransferStatusDto } from '@erp-platform/contracts';
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

import { useStockTransfers } from '../../api/stock-documents/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { INV } from '../../../../lib/permissions';
import { TRANSFER_STATUS_VARIANT, TRANSFERS_PATH } from '../../lib/document-status';

const TABS = ['all', 'draft', 'in_transit', 'received', 'cancelled'] as const;

/** التحويلات بين المخازن — list with a status filter. */
export function StockTransfersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('status') ?? '') ? params.get('status')! : 'all';
  const { data: transfers, isLoading } = useStockTransfers(
    tab === 'all' ? undefined : (tab as StockTransferStatusDto),
  );
  const { data: warehouses } = useWarehouses();
  const warehouseName = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.transfers.title')}
        description={t('inventory.transfers.description')}
        actions={
          <Can permission={INV.transfersManage}>
            <Button onClick={() => navigate(`${TRANSFERS_PATH}/new`)}>
              <Plus />
              {t('inventory.transfers.new')}
            </Button>
          </Can>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setParams(value === 'all' ? {} : { status: value }, { replace: true })}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {value === 'all' ? t('common.all') : t(`inventory.transfers.statuses.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (transfers ?? []).length === 0 ? (
            <EmptyState className="py-12" icon={<ArrowLeftRight />} title={t('inventory.transfers.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.transfers.number')}</TableHead>
                    <TableHead>{t('inventory.transfers.from')}</TableHead>
                    <TableHead>{t('inventory.transfers.to')}</TableHead>
                    <TableHead>{t('inventory.transfers.date')}</TableHead>
                    <TableHead>{t('inventory.transfers.status')}</TableHead>
                    <TableHead>{t('documents.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transfers ?? []).map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-medium">
                        <Link className="text-primary hover:underline" to={`${TRANSFERS_PATH}/${transfer.id}`}>
                          {transfer.transferNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{warehouseName.get(transfer.fromWarehouseId) ?? '—'}</TableCell>
                      <TableCell>{warehouseName.get(transfer.toWarehouseId) ?? '—'}</TableCell>
                      <TableCell dir="ltr" className="text-end">
                        {transfer.transferDate}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TRANSFER_STATUS_VARIANT[transfer.status]} dot>
                          {t(`inventory.transfers.statuses.${transfer.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">{transfer.notes ?? ''}</TableCell>
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
