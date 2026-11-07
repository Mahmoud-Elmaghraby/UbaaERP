import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SupplierPaymentDto, SupplierPaymentStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useSuppliers } from '../../api/suppliers/queries';
import { useSupplierPayments } from '../../api/supplier-payments/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { SUPPLIER_PAYMENT_STATUS_VARIANT, SUPPLIER_PAYMENTS_PATH, supplierPaymentStatusLabelKey } from './supplier-payment-status';

const STATUS_TABS = ['all', 'draft', 'posted', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = SupplierPaymentDto & { supplierName: string };

/** مدفوعات الموردين — status tabs and search; a row opens the payment's page. */
export function SupplierPaymentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: payments, isLoading } = useSupplierPayments();
  const { data: suppliers } = useSuppliers();

  const rows = useMemo<Row[]>(() => {
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (payments ?? []).map((p) => ({ ...p, supplierName: supplierName.get(p.supplierId) ?? '—' }));
  }, [payments, suppliers]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'paymentNumber',
        header: t('purchases.supplierPayments.paymentNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.paymentNumber}</span>,
      },
      {
        id: 'date',
        header: t('purchases.supplierPayments.paymentDate'),
        accessorFn: (row) => formatDate(row.paymentDate ?? row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'supplierName', header: t('purchases.supplierPayments.supplier') },
      {
        id: 'paymentMethod',
        header: t('purchases.supplierPayments.paymentMethod'),
        accessorFn: (row) => t(`purchases.supplierPayments.paymentMethodValue.${row.paymentMethod}`),
      },
      {
        id: 'amount',
        header: () => <div className="text-end">{t('purchases.supplierPayments.amount')}</div>,
        accessorFn: (row) => row.amount.amountMinorUnits,
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.amount.amountMinorUnits} currency={row.original.amount.currency} />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(supplierPaymentStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={SUPPLIER_PAYMENT_STATUS_VARIANT[row.original.status]} dot>
            {t(supplierPaymentStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  // Old links (?view=<id>, e.g. from the cheques screen) now open the payment's own page.
  const legacyView = params.get('view');
  if (legacyView) return <Navigate to={`${SUPPLIER_PAYMENTS_PATH}/${legacyView}`} replace />;

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.supplierPayments')}
        description={t('purchases.supplierPayments.subtitle')}
        actions={
          <Can permission="purchases.manage">
            <Button asChild>
              <Link to={`${SUPPLIER_PAYMENTS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.supplierPayments.newPayment')}
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
        searchPlaceholder={t('purchases.supplierPayments.search')}
        onRowClick={(row) => navigate(`${SUPPLIER_PAYMENTS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(supplierPaymentStatusLabelKey(tab as SupplierPaymentStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}
