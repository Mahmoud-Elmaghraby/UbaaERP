import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { IssuedChequeDto, ReceivedChequeDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  cn,
  DataTable,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useHasPermission,
} from '@erp-platform/ui';
import { Banknote } from 'lucide-react';

import { useIssuedCheques, useReceivedCheques } from '../../api/cheques/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { ChequeDueDate, chequeDueState, ChequeStatusBadge } from '../../../../components/document/cheque-fields';
import { PAYMENTS_RECEIVED_PATH } from '../payments-received/payment-received-status';
import { useChequeActions } from './use-cheque-actions';

export const CHEQUES_PATH = '/sales/cheques';
export const SUPPLIER_PAYMENTS_PATH = '/purchases/supplier-payments';

type Side = 'received' | 'issued';
type ReceivedFilter = 'all' | ReceivedChequeDto['status'];
type IssuedFilter = 'all' | IssuedChequeDto['status'];
const RECEIVED_FILTERS: readonly ReceivedFilter[] = ['all', 'in_hand', 'collected', 'bounced', 'endorsed'];
const ISSUED_FILTERS: readonly IssuedFilter[] = ['all', 'issued', 'cleared'];

/** Sums per currency (cheques may be in several currencies). */
function sumByCurrency(rows: { amount: { amountMinorUnits: string; currency: string } }[]): Map<string, bigint> {
  const sums = new Map<string, bigint>();
  for (const row of rows) {
    sums.set(row.amount.currency, (sums.get(row.amount.currency) ?? 0n) + BigInt(row.amount.amountMinorUnits));
  }
  return sums;
}

function Sums({ sums }: { sums: Map<string, bigint> }) {
  if (sums.size === 0) return <Amount value="0" zeroAsDash />;
  return (
    <span className="flex flex-col">
      {[...sums].map(([currency, minor]) => (
        <Amount key={currency} value={minor.toString()} currency={currency} />
      ))}
    </span>
  );
}

function Kpi({ label, value, hint, loading, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; loading?: boolean; tone?: 'danger' | 'warning' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-card">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <span className={cn('text-xl font-bold', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning')}>{value}</span>
      )}
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** /sales/cheques — أوراق القبض (customer cheques) and أوراق الدفع (our cheques to suppliers). */
export function ChequesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canPurchases = useHasPermission('purchases.manage');
  const side: Side = params.get('tab') === 'issued' && canPurchases ? 'issued' : 'received';
  const rawStatus = params.get('status');
  const receivedFilter: ReceivedFilter =
    side === 'received' && RECEIVED_FILTERS.includes(rawStatus as ReceivedFilter) ? (rawStatus as ReceivedFilter) : 'all';
  const issuedFilter: IssuedFilter =
    side === 'issued' && ISSUED_FILTERS.includes(rawStatus as IssuedFilter) ? (rawStatus as IssuedFilter) : 'all';

  const { data: received, isLoading: receivedLoading } = useReceivedCheques();
  const { data: issued, isLoading: issuedLoading } = useIssuedCheques({}, canPurchases);
  const { open: openAction, dialog: actionDialog } = useChequeActions();

  const kpis = useMemo(() => {
    const inHand = (received ?? []).filter((row) => row.status === 'in_hand');
    return {
      inHand: sumByCurrency(inHand),
      inHandCount: inHand.length,
      dueSoon: sumByCurrency(inHand.filter((row) => chequeDueState(row.dueDate) === 'soon')),
      overdue: sumByCurrency(inHand.filter((row) => chequeDueState(row.dueDate) === 'overdue')),
      issuedOutstanding: sumByCurrency((issued ?? []).filter((row) => row.status === 'issued')),
      issuedCount: (issued ?? []).filter((row) => row.status === 'issued').length,
    };
  }, [received, issued]);

  const receivedCounts = useMemo(() => {
    const counts: Record<ReceivedFilter, number> = { all: 0, in_hand: 0, collected: 0, bounced: 0, endorsed: 0 };
    for (const row of received ?? []) {
      counts.all += 1;
      counts[row.status] += 1;
    }
    return counts;
  }, [received]);
  const issuedCounts = useMemo(() => {
    const counts: Record<IssuedFilter, number> = { all: 0, issued: 0, cleared: 0 };
    for (const row of issued ?? []) {
      counts.all += 1;
      counts[row.status] += 1;
    }
    return counts;
  }, [issued]);

  const receivedRows = useMemo(
    () => (received ?? []).filter((row) => receivedFilter === 'all' || row.status === receivedFilter),
    [received, receivedFilter],
  );
  const issuedRows = useMemo(
    () => (issued ?? []).filter((row) => issuedFilter === 'all' || row.status === issuedFilter),
    [issued, issuedFilter],
  );

  const receivedColumns = useMemo<ColumnDef<ReceivedChequeDto>[]>(
    () => [
      {
        id: 'chequeNumber',
        header: t('cheques.number'),
        accessorFn: (row) => row.chequeNumber ?? '',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {row.original.chequeNumber ?? '—'}
          </span>
        ),
      },
      { id: 'bank', header: t('cheques.bank'), accessorFn: (row) => row.bank ?? '—' },
      {
        accessorKey: 'customerName',
        header: t('cheques.customer'),
        cell: ({ row }) => <span className="font-medium">{row.original.customerName}</span>,
      },
      {
        accessorKey: 'paymentNumber',
        header: t('cheques.receipt'),
        cell: ({ row }) => (
          <Link
            to={`${PAYMENTS_RECEIVED_PATH}/${row.original.id}`}
            className="tabular-nums text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.paymentNumber}
          </Link>
        ),
      },
      {
        id: 'dueDate',
        header: t('cheques.dueDate'),
        accessorFn: (row) => row.dueDate ?? '',
        cell: ({ row }) => (
          <ChequeDueDate
            dueDate={row.original.dueDate}
            formatted={formatDate(row.original.dueDate)}
            active={row.original.status === 'in_hand'}
          />
        ),
      },
      {
        id: 'amount',
        header: () => <div className={AMOUNT_CELL}>{t('cheques.amount')}</div>,
        accessorFn: (row) => Number(row.amount.amountMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.amount.amountMinorUnits} currency={row.original.amount.currency} />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(`cheques.status.${row.status}`),
        cell: ({ row }) => {
          const cheque = row.original;
          const detail =
            cheque.status === 'collected'
              ? cheque.treasuryName
              : cheque.status === 'endorsed'
                ? cheque.endorsedToSupplierName
                : null;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <ChequeStatusBadge status={cheque.status} />
              {cheque.status !== 'in_hand' && (cheque.statusDate || detail) ? (
                <span className="text-xs text-muted-foreground">
                  {[detail, cheque.statusDate ? formatDate(cheque.statusDate) : null].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const cheque = row.original;
          if (cheque.status !== 'in_hand') return null;
          const target = { id: cheque.id, currency: cheque.amount.currency, chequeNumber: cheque.chequeNumber };
          return (
            <Can permission="sales.manage">
              <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => openAction('collect', target)}>
                  {t('cheques.actions.collect')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => openAction('bounce', target)}
                >
                  {t('cheques.actions.bounce')}
                </Button>
              </div>
            </Can>
          );
        },
      },
    ],
    [t, openAction],
  );

  const issuedColumns = useMemo<ColumnDef<IssuedChequeDto>[]>(
    () => [
      {
        id: 'chequeNumber',
        header: t('cheques.number'),
        accessorFn: (row) => row.chequeNumber ?? '',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums" dir="ltr">
            {row.original.chequeNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'bank',
        header: t('cheques.bank'),
        accessorFn: (row) => row.bank ?? row.treasuryName ?? '—',
      },
      {
        accessorKey: 'supplierName',
        header: t('cheques.supplier'),
        cell: ({ row }) => <span className="font-medium">{row.original.supplierName}</span>,
      },
      {
        accessorKey: 'paymentNumber',
        header: t('cheques.supplierPayment'),
        cell: ({ row }) => (
          <Link
            to={`${SUPPLIER_PAYMENTS_PATH}?view=${row.original.id}`}
            className="tabular-nums text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.paymentNumber}
          </Link>
        ),
      },
      {
        id: 'dueDate',
        header: t('cheques.dueDate'),
        accessorFn: (row) => row.dueDate ?? '',
        cell: ({ row }) => (
          <ChequeDueDate
            dueDate={row.original.dueDate}
            formatted={formatDate(row.original.dueDate)}
            active={row.original.status === 'issued'}
          />
        ),
      },
      {
        id: 'amount',
        header: () => <div className={AMOUNT_CELL}>{t('cheques.amount')}</div>,
        accessorFn: (row) => Number(row.amount.amountMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.amount.amountMinorUnits} currency={row.original.amount.currency} />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(`cheques.status.${row.status}`),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <ChequeStatusBadge status={row.original.status} />
            {row.original.status === 'cleared' && row.original.statusDate ? (
              <span className="text-xs text-muted-foreground">{formatDate(row.original.statusDate)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const cheque = row.original;
          if (cheque.status !== 'issued') return null;
          return (
            <Can permission="purchases.manage">
              <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openAction('clear', { id: cheque.id, currency: cheque.amount.currency, chequeNumber: cheque.chequeNumber })
                  }
                >
                  {t('cheques.actions.clear')}
                </Button>
              </div>
            </Can>
          );
        },
      },
    ],
    [t, openAction],
  );

  function setSide(next: string) {
    setParams(next === 'issued' ? { tab: 'issued' } : {}, { replace: true });
  }
  function setStatus(next: string) {
    const query: Record<string, string> = {};
    if (side === 'issued') query.tab = 'issued';
    if (next !== 'all') query.status = next;
    setParams(query, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('cheques.title')} description={t('cheques.subtitle')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('cheques.kpi.inHand')}
          loading={receivedLoading}
          value={<Sums sums={kpis.inHand} />}
          hint={t('cheques.kpi.count', { count: kpis.inHandCount })}
        />
        <Kpi
          label={t('cheques.kpi.dueThisWeek')}
          loading={receivedLoading}
          tone={kpis.dueSoon.size > 0 ? 'warning' : undefined}
          value={<Sums sums={kpis.dueSoon} />}
        />
        <Kpi
          label={t('cheques.kpi.overdue')}
          loading={receivedLoading}
          tone={kpis.overdue.size > 0 ? 'danger' : undefined}
          value={<Sums sums={kpis.overdue} />}
        />
        <Can permission="purchases.manage">
          <Kpi
            label={t('cheques.kpi.issuedOutstanding')}
            loading={issuedLoading}
            value={<Sums sums={kpis.issuedOutstanding} />}
            hint={t('cheques.kpi.count', { count: kpis.issuedCount })}
          />
        </Can>
      </div>

      <Tabs value={side} onValueChange={setSide}>
        <TabsList>
          <TabsTrigger value="received">{t('cheques.tabs.received')}</TabsTrigger>
          <Can permission="purchases.manage">
            <TabsTrigger value="issued">{t('cheques.tabs.issued')}</TabsTrigger>
          </Can>
        </TabsList>
        <TabsContent value="received" className="mt-4">
          <DataTable
            columns={receivedColumns}
            data={receivedRows}
            isLoading={receivedLoading}
            searchable
            searchPlaceholder={t('cheques.search')}
            onRowClick={(cheque) => navigate(`${PAYMENTS_RECEIVED_PATH}/${cheque.id}`)}
            emptyState={
              receivedFilter === 'all' ? (
                <EmptyState icon={<Banknote />} title={t('cheques.emptyReceived')} description={t('cheques.emptyReceivedHint')} />
              ) : undefined
            }
            toolbar={
              <StatusTabs
                tabs={RECEIVED_FILTERS}
                value={receivedFilter}
                onChange={setStatus}
                label={(tab) => (tab === 'all' ? t('documents.all') : t(`cheques.status.${tab}`))}
                counts={receivedCounts}
              />
            }
          />
        </TabsContent>
        {canPurchases ? (
          <TabsContent value="issued" className="mt-4">
            <DataTable
              columns={issuedColumns}
              data={issuedRows}
              isLoading={issuedLoading}
              searchable
              searchPlaceholder={t('cheques.search')}
              onRowClick={(cheque) => navigate(`${SUPPLIER_PAYMENTS_PATH}?view=${cheque.id}`)}
              emptyState={
                issuedFilter === 'all' ? <EmptyState icon={<Banknote />} title={t('cheques.emptyIssued')} /> : undefined
              }
              toolbar={
                <StatusTabs
                  tabs={ISSUED_FILTERS}
                  value={issuedFilter}
                  onChange={setStatus}
                  label={(tab) => (tab === 'all' ? t('documents.all') : t(`cheques.status.${tab}`))}
                  counts={issuedCounts}
                />
              }
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {actionDialog}
    </div>
  );
}
