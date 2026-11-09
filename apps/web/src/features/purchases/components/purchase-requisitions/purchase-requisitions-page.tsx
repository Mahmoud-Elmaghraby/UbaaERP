import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PurchaseRequisitionDto, PurchaseRequisitionStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useBranches } from '../../../settings/queries';
import { useUsers } from '../../../users-permissions/queries';
import { usePurchaseRequisitions } from '../../api/purchase-requisitions/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import {
  PURCHASE_REQUISITION_STATUS_VARIANT,
  PURCHASE_REQUISITIONS_PATH,
  purchaseRequisitionStatusLabelKey,
} from './purchase-requisition-status';
import { PURCH } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'submitted', 'approved', 'rejected', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = PurchaseRequisitionDto & { branchName: string; requesterName: string };

/** طلبات الشراء — "submitted" is the approvals inbox; a row opens the requisition's page. */
export function PurchaseRequisitionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: requisitions, isLoading } = usePurchaseRequisitions();
  const { data: branches } = useBranches();
  const { data: users } = useUsers();

  const rows = useMemo<Row[]>(() => {
    const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
    const userName = new Map((users ?? []).map((u) => [u.id, u.fullName]));
    return (requisitions ?? []).map((r) => ({
      ...r,
      branchName: (r.branchId && branchName.get(r.branchId)) || '—',
      requesterName: userName.get(r.requestedBy) ?? '—',
    }));
  }, [requisitions, branches, users]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'requisitionNumber',
        header: t('purchases.purchaseRequisitions.requisitionNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.requisitionNumber}</span>,
      },
      {
        id: 'date',
        header: t('documents.date'),
        accessorFn: (row) => formatDate(row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'requesterName', header: t('purchases.purchaseRequisitions.requestedBy') },
      { accessorKey: 'branchName', header: t('purchases.purchaseRequisitions.branch') },
      {
        id: 'neededByDate',
        header: t('purchases.purchaseRequisitions.neededByDate'),
        accessorFn: (row) => (row.neededByDate ? formatDate(row.neededByDate) : '—'),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(purchaseRequisitionStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={PURCHASE_REQUISITION_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseRequisitionStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.purchaseRequisitions')}
        description={t('purchases.purchaseRequisitions.subtitle')}
        actions={
          <Can permission={PURCH.create}>
            <Button asChild>
              <Link to={`${PURCHASE_REQUISITIONS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.purchaseRequisitions.newRequisition')}
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
        searchPlaceholder={t('purchases.purchaseRequisitions.search')}
        onRowClick={(row) => navigate(`${PURCHASE_REQUISITIONS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) =>
              tab === 'all' ? t('documents.all') : t(purchaseRequisitionStatusLabelKey(tab as PurchaseRequisitionStatusDto))
            }
            counts={counts}
          />
        }
      />
    </div>
  );
}
