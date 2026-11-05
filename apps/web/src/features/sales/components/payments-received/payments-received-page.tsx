import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PaymentReceivedRegisterRowDto, PaymentReceivedStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, EmptyState, PageHeader } from '@erp-platform/ui';
import { Plus, Wallet } from 'lucide-react';

import { usePaymentReceivedRegister } from '../../api/payments-received/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import {
  PAYMENT_RECEIVED_STATUS_VARIANT,
  PAYMENTS_RECEIVED_PATH,
  paymentReceivedStatusLabelKey,
} from './payment-received-status';

type StatusTab = 'all' | 'unallocated' | PaymentReceivedStatusDto;
const STATUS_TABS: readonly StatusTab[] = ['all', 'draft', 'posted', 'unallocated', 'bounced', 'cancelled'];

function hasUnallocated(row: PaymentReceivedRegisterRowDto): boolean {
  return row.status === 'posted' && BigInt(row.unallocatedMinorUnits) > 0n;
}

/** المقبوضات — status tabs, search; a row opens the payment's page. */
export function PaymentsReceivedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') as StatusTab | null;
  const status: StatusTab = rawStatus && STATUS_TABS.includes(rawStatus) ? rawStatus : 'all';
  const { data: payments, isLoading } = usePaymentReceivedRegister();

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = { all: 0, draft: 0, posted: 0, unallocated: 0, cancelled: 0, bounced: 0 };
    for (const payment of payments ?? []) {
      result.all += 1;
      result[payment.status] += 1;
      if (hasUnallocated(payment)) result.unallocated += 1;
    }
    return result;
  }, [payments]);

  const rows = useMemo(
    () =>
      (payments ?? []).filter((payment) =>
        status === 'all' ? true : status === 'unallocated' ? hasUnallocated(payment) : payment.status === status,
      ),
    [payments, status],
  );

  const columns = useMemo<ColumnDef<PaymentReceivedRegisterRowDto>[]>(
    () => [
      {
        accessorKey: 'paymentNumber',
        header: t('sales.paymentsReceived.paymentNumber'),
        cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.paymentNumber}</span>,
      },
      {
        id: 'paymentDate',
        header: t('sales.paymentsReceived.paymentDate'),
        accessorFn: (row) => row.paymentDate ?? '',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDate(row.original.paymentDate ?? row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('sales.paymentsReceived.customer'),
        cell: ({ row }) => <span className="font-medium">{row.original.customerName}</span>,
      },
      {
        id: 'method',
        header: t('sales.paymentsReceived.paymentMethod'),
        accessorFn: (row) => t(`sales.paymentsReceived.paymentMethodValue.${row.paymentMethod}`),
        cell: ({ getValue }) => <span className="text-secondary-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'amount',
        header: () => <div className={AMOUNT_CELL}>{t('sales.paymentsReceived.amount')}</div>,
        accessorFn: (row) => Number(row.amountMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.amountMinorUnits} currency={row.original.currency} />
          </div>
        ),
      },
      {
        id: 'unallocated',
        header: () => <div className={AMOUNT_CELL}>{t('sales.paymentsReceived.unallocatedAmount')}</div>,
        accessorFn: (row) => Number(row.unallocatedMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            {row.original.status === 'cancelled' || row.original.status === 'bounced' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Amount value={row.original.unallocatedMinorUnits} currency={row.original.currency} zeroAsDash />
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(paymentReceivedStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={PAYMENT_RECEIVED_STATUS_VARIANT[row.original.status]} dot>
            {t(paymentReceivedStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  const newButton = (
    <Can permission="sales.manage">
      <Button asChild>
        <Link to={`${PAYMENTS_RECEIVED_PATH}/new`}>
          <Plus />
          {t('sales.paymentsReceived.newPayment')}
        </Link>
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('sales.tabs.paymentsReceived')}
        description={t('sales.paymentsReceived.subtitle')}
        actions={newButton}
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('sales.paymentsReceived.search')}
        onRowClick={(payment) => navigate(`${PAYMENTS_RECEIVED_PATH}/${payment.id}`)}
        emptyState={
          status === 'all' ? (
            <EmptyState icon={<Wallet />} title={t('sales.paymentsReceived.emptyTitle')} action={newButton} />
          ) : undefined
        }
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) =>
              tab === 'all'
                ? t('documents.all')
                : tab === 'unallocated'
                  ? t('sales.paymentsReceived.unallocatedTab')
                  : t(paymentReceivedStatusLabelKey(tab))
            }
            counts={counts}
          />
        }
      />
    </div>
  );
}
