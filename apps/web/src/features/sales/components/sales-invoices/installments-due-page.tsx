import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { InstallmentDueRowDto, InstallmentStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, EmptyState, Input, Label, PageHeader } from '@erp-platform/ui';
import { CalendarClock, Wallet } from 'lucide-react';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate, toIsoDate } from '../../../../lib/format-date';
import { useInstallmentsDue } from '../../api/sales-invoices/installments';
import { CustomerPicker } from '../../lib/customer-picker';
import { SALES_INVOICES_PATH } from './sales-invoice-status';
import { INSTALLMENT_STATUS_VARIANT } from './sales-invoice-installments-section';
import { SALES } from '../../../../lib/permissions';

type StatusTab = 'all' | Exclude<InstallmentStatusDto, 'paid'>;
const STATUS_TABS: readonly StatusTab[] = ['all', 'overdue', 'due', 'partially_paid'];

function endOfMonth(): string {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/**
 * الأقساط المستحقة — open installments of posted invoices across customers,
 * oldest due first. Default period: everything due up to the end of this
 * month (so overdue ones always show). A row opens the invoice; "تحصيل"
 * opens a receipt for that customer and invoice.
 */
export function InstallmentsDuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') as StatusTab | null;
  const status: StatusTab = rawStatus && STATUS_TABS.includes(rawStatus) ? rawStatus : 'all';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? endOfMonth();
  const customerId = params.get('customerId') ?? '';
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const { data, isLoading } = useInstallmentsDue({ fromDate, toDate, customerId });
  const rows = useMemo(() => (data ?? []).filter((row) => status === 'all' || row.status === status), [data, status]);
  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: data?.length ?? 0 };
    for (const row of data ?? []) {
      const key = row.status as StatusTab;
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [data]);
  const currencies = new Set(rows.map((r) => r.currency));
  const singleCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  const remainingTotal = rows.reduce((sum, r) => sum + BigInt(r.remainingMinorUnits), 0n);
  const overdueTotal = rows.filter((r) => r.status === 'overdue').reduce((sum, r) => sum + BigInt(r.remainingMinorUnits), 0n);

  const columns = useMemo<ColumnDef<InstallmentDueRowDto>[]>(
    () => [
      {
        accessorKey: 'dueDate',
        header: t('sales.installments.dueDate'),
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.dueDate)}</span>,
      },
      {
        accessorKey: 'customerName',
        header: t('sales.salesInvoices.customer'),
        cell: ({ row }) => <span className="font-medium">{row.original.customerName}</span>,
      },
      {
        accessorKey: 'invoiceNumber',
        header: t('sales.salesInvoices.invoiceNumber'),
        cell: ({ row }) => (
          <Link
            to={`${SALES_INVOICES_PATH}/${row.original.salesInvoiceId}`}
            className="tabular-nums text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        id: 'sequence',
        header: t('sales.installments.installment'),
        accessorFn: (row) => row.sequence,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.sequence}/{row.original.installmentsCount}
          </span>
        ),
      },
      {
        id: 'amount',
        header: () => <div className={AMOUNT_CELL}>{t('sales.installments.amount')}</div>,
        accessorFn: (row) => Number(row.amountMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.amountMinorUnits} currency={row.original.currency} />
          </div>
        ),
      },
      {
        id: 'remaining',
        header: () => <div className={AMOUNT_CELL}>{t('sales.installments.remaining')}</div>,
        accessorFn: (row) => Number(row.remainingMinorUnits),
        cell: ({ row }) => (
          <div className={`${AMOUNT_CELL} font-semibold`}>
            <Amount value={row.original.remainingMinorUnits} currency={row.original.currency} />
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant={INSTALLMENT_STATUS_VARIANT[row.original.status]} dot>
              {t(`sales.installments.status.${row.original.status}`)}
            </Badge>
            {row.original.overdueDays > 0 ? (
              <span className="text-xs text-danger">{t('sales.salesInvoices.overdueDays', { days: row.original.overdueDays })}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Can permission={SALES.create}>
            <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
              <Link
                to={`/sales/payments-received/new?customerId=${row.original.customerId}&invoiceId=${row.original.salesInvoiceId}`}
              >
                <Wallet />
                {t('sales.installments.collect')}
              </Link>
            </Button>
          </Can>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('sales.installments.reportTitle')} description={t('sales.installments.reportDescription')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="due-from">{t('sales.installments.from')}</Label>
          <Input id="due-from" type="date" value={fromDate} onChange={(e) => setParam('from', e.target.value || null)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="due-to">{t('sales.installments.to')}</Label>
          <Input id="due-to" type="date" value={toDate} onChange={(e) => setParam('to', e.target.value || null)} />
        </div>
        <div className="grid min-w-[16rem] gap-1.5">
          <Label>{t('sales.salesInvoices.customer')}</Label>
          <CustomerPicker value={customerId || null} onChange={(id) => setParam('customerId', id)} />
        </div>
        {customerId ? (
          <Button variant="ghost" size="sm" onClick={() => setParam('customerId', null)}>
            {t('sales.installments.allCustomers')}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs
          tabs={STATUS_TABS}
          value={status}
          onChange={(tab) => setParam('status', tab === 'all' ? null : tab)}
          label={(tab) => (tab === 'all' ? t('common.all') : t(`sales.installments.status.${tab}`))}
          counts={counts}
        />
        {singleCurrency ? (
          <div className="flex gap-4 text-sm">
            <span>
              {t('sales.installments.totalRemaining')}: <Amount value={remainingTotal.toString()} currency={singleCurrency} />
            </span>
            <span className="text-danger">
              {t('sales.installments.totalOverdue')}: <Amount value={overdueTotal.toString()} currency={singleCurrency} />
            </span>
          </div>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('sales.installments.search')}
        onRowClick={(row) => navigate(`${SALES_INVOICES_PATH}/${row.salesInvoiceId}`)}
        emptyState={<EmptyState icon={<CalendarClock />} title={t('sales.installments.reportEmpty')} />}
      />
    </div>
  );
}
