import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { QuotationListItemDto, QuotationStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader, cn } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useCustomers } from '../../api/customers/queries';
import { useQuotations } from '../../api/quotations/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { QUOTATION_STATUS_VARIANT, QUOTATIONS_PATH, isQuotationExpired, quotationStatusLabelKey } from './quotation-status';
import { SALES } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'sent', 'accepted', 'rejected', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

type Row = QuotationListItemDto & { customerName: string };

/** عروض الأسعار — status tabs, search, a row opens the quotation's page. */
export function QuotationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: quotations, isLoading } = useQuotations();
  const { data: customers } = useCustomers();

  const rows = useMemo<Row[]>(() => {
    const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    return (quotations ?? []).map((q) => ({ ...q, customerName: nameById.get(q.customerId) ?? '—' }));
  }, [quotations, customers]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const today = todayIso();
    return [
      {
        accessorKey: 'quotationNumber',
        header: t('sales.quotations.quotationNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.quotationNumber}</span>,
      },
      {
        id: 'date',
        header: t('sales.quotations.date'),
        accessorFn: (row) => formatDate(row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'customerName', header: t('sales.quotations.customer') },
      {
        id: 'validUntilDate',
        header: t('sales.quotations.validUntilDate'),
        accessorFn: (row) => row.validUntilDate ?? '',
        cell: ({ row }) => {
          const expired = isQuotationExpired(row.original, today);
          return row.original.validUntilDate ? (
            <span className={cn('tabular-nums', expired && 'font-medium text-danger')}>
              {formatDate(row.original.validUntilDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'total',
        header: () => <div className="text-end">{t('sales.quotations.totalAmount')}</div>,
        accessorFn: (row) => row.totalAmount?.amountMinorUnits ?? '',
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.totalAmount?.amountMinorUnits} currency={row.original.totalAmount?.currency} />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(quotationStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={QUOTATION_STATUS_VARIANT[row.original.status]} dot>
            {t(quotationStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ];
  }, [t]);

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('sales.tabs.quotations')}
        description={t('sales.quotations.subtitle')}
        actions={
          <Can permission={SALES.create}>
            <Button asChild>
              <Link to={`${QUOTATIONS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('sales.quotations.newQuotation')}
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
        searchPlaceholder={t('sales.quotations.search')}
        onRowClick={(row) => navigate(`${QUOTATIONS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(quotationStatusLabelKey(tab as QuotationStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}
