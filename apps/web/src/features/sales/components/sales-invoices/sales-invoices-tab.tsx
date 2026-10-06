import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, MoreHorizontal, Plus } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SalesInvoiceDto, SalesInvoiceStatusDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  cn,
} from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useSalesInvoices } from '../../api/sales-invoices/queries';
import { SALES_INVOICE_STATUS_VARIANT, salesInvoiceStatusLabelKey } from './sales-invoice-status';
import { useSalesInvoiceActions } from './use-sales-invoice-actions';

export const SALES_INVOICES_PATH = '/sales/sales-invoices';

type StatusFilter = 'all' | SalesInvoiceStatusDto;
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'posted', 'cancelled'];

/**
 * Sales invoices list. Creating and viewing an invoice are full pages now
 * (…/new and …/:id — see sales-invoice-create-page / sales-invoice-details-page),
 * no longer dialogs; a row click opens the invoice.
 */
export function SalesInvoicesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: invoices, isLoading } = useSalesInvoices();
  const { data: salesOrders } = useSalesOrders();
  const { data: customers } = useCustomers();
  const actions = useSalesInvoiceActions();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const soById = useMemo(() => new Map((salesOrders ?? []).map((so) => [so.id, so])), [salesOrders]);
  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: 0, draft: 0, posted: 0, cancelled: 0 };
    for (const invoice of invoices ?? []) {
      result.all += 1;
      result[invoice.status] += 1;
    }
    return result;
  }, [invoices]);

  const rows = useMemo(
    () => (invoices ?? []).filter((inv) => statusFilter === 'all' || inv.status === statusFilter),
    [invoices, statusFilter],
  );

  const columns = useMemo<ColumnDef<SalesInvoiceDto>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: t('sales.salesInvoices.invoiceNumber'),
        cell: ({ row }: { row: Row<SalesInvoiceDto> }) => (
          <span className="tabular font-semibold text-brand-700 dark:text-primary">
            {row.original.invoiceNumber}
          </span>
        ),
      },
      {
        id: 'customer',
        header: t('sales.salesInvoices.customer'),
        accessorFn: (row: SalesInvoiceDto) => {
          const customerId = soById.get(row.salesOrderId)?.customerId;
          return (customerId && customerById.get(customerId)?.name) || '—';
        },
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      {
        id: 'salesOrder',
        header: t('sales.salesInvoices.salesOrder'),
        accessorFn: (row: SalesInvoiceDto) => soById.get(row.salesOrderId)?.soNumber ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'invoiceDate',
        header: t('sales.salesInvoices.invoiceDate'),
        accessorFn: (row: SalesInvoiceDto) => row.invoiceDate ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'dueDate',
        header: t('sales.salesInvoices.dueDate'),
        accessorFn: (row: SalesInvoiceDto) => row.dueDate ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: SalesInvoiceDto) => t(salesInvoiceStatusLabelKey(row.status)),
        cell: ({ row }: { row: Row<SalesInvoiceDto> }) => (
          <Badge variant={SALES_INVOICE_STATUS_VARIANT[row.original.status]} dot>
            {t(salesInvoiceStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }: { row: Row<SalesInvoiceDto> }) => {
          const invoice = row.original;
          return (
            // Stop clicks (also from the portalled menu) from reaching the row's onClick.
            <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate(`${SALES_INVOICES_PATH}/${invoice.id}`)}>
                    {t('documents.open')}
                  </DropdownMenuItem>
                  <Can permission="sales.manage">
                    {invoice.status === 'draft' ? (
                      <>
                        <DropdownMenuItem onSelect={() => void actions.post(invoice.id)}>
                          {t('sales.salesInvoices.post')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void actions.cancel(invoice.id)}>
                          {t('sales.salesInvoices.cancel')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {invoice.status === 'draft' || invoice.status === 'cancelled' ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-danger focus:bg-danger-soft focus:text-danger"
                          onSelect={() => void actions.remove(invoice.id)}
                        >
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, soById, customerById, navigate, actions],
  );

  const newButton = (
    <Can permission="sales.manage">
      <Button asChild>
        <Link to={`${SALES_INVOICES_PATH}/new`}>
          <Plus />
          {t('sales.salesInvoices.newInvoice')}
        </Link>
      </Button>
    </Can>
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      onRowClick={(invoice) => navigate(`${SALES_INVOICES_PATH}/${invoice.id}`)}
      searchPlaceholder={t('common.search')}
      emptyState={
        statusFilter === 'all' ? (
          <EmptyState
            icon={<FileText />}
            title={t('sales.salesInvoices.emptyTitle')}
            description={t('sales.salesInvoices.emptyDescription')}
            action={newButton}
          />
        ) : undefined
      }
      toolbar={
        <div role="tablist" aria-label={t('common.status')} className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((status) => {
            const active = status === statusFilter;
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  active ? 'bg-accent text-accent-foreground' : 'text-secondary-foreground hover:bg-muted',
                )}
              >
                {status === 'all' ? t('documents.all') : t(salesInvoiceStatusLabelKey(status))}
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 text-[11px]',
                    active ? 'bg-card text-accent-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {counts[status]}
                </span>
              </button>
            );
          })}
        </div>
      }
    />
  );
}
