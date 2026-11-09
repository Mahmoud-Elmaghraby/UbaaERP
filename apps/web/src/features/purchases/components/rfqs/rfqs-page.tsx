import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { RfqDto, RfqStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useRfqs } from '../../api/rfqs/queries';
import { usePurchaseRequisitions } from '../../api/purchase-requisitions/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { RFQ_STATUS_VARIANT, RFQS_PATH, rfqStatusLabelKey } from './rfq-status';
import { PURCH } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'sent', 'closed', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = RfqDto & { requisitionNumber: string };

/** طلبات عروض الأسعار — status tabs and search; a row opens the RFQ with its quotations. */
export function RfqsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: rfqs, isLoading } = useRfqs();
  const { data: requisitions } = usePurchaseRequisitions();

  const rows = useMemo<Row[]>(() => {
    const requisitionNumber = new Map((requisitions ?? []).map((r) => [r.id, r.requisitionNumber]));
    return (rfqs ?? []).map((rfq) => ({
      ...rfq,
      requisitionNumber: (rfq.sourceRequisitionId && requisitionNumber.get(rfq.sourceRequisitionId)) || '—',
    }));
  }, [rfqs, requisitions]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'rfqNumber',
        header: t('purchases.rfqs.rfqNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.rfqNumber}</span>,
      },
      {
        id: 'date',
        header: t('documents.date'),
        accessorFn: (row) => formatDate(row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        accessorKey: 'requisitionNumber',
        header: t('purchases.rfqs.sourceRequisition'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.requisitionNumber}</span>,
      },
      { id: 'notes', header: t('documents.notes'), accessorFn: (row) => row.notes ?? '' },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(rfqStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={RFQ_STATUS_VARIANT[row.original.status]} dot>
            {t(rfqStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.rfqs')}
        description={t('purchases.rfqs.subtitle')}
        actions={
          <Can permission={PURCH.create}>
            <Button asChild>
              <Link to={`${RFQS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.rfqs.newRfq')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('purchases.rfqs.search')}
        onRowClick={(row) => navigate(`${RFQS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(rfqStatusLabelKey(tab as RfqStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}
