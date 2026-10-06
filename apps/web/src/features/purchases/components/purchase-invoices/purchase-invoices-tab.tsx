import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, MoreHorizontal, Plus } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PurchaseInvoiceDto, PurchaseInvoiceStatusDto } from '@erp-platform/contracts';
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

import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { usePurchaseInvoices } from '../../api/purchase-invoices/queries';
import { PURCHASE_INVOICE_STATUS_VARIANT, purchaseInvoiceStatusLabelKey } from './purchase-invoice-status';
import { usePurchaseInvoiceActions } from './use-purchase-invoice-actions';

export const PURCHASE_INVOICES_PATH = '/purchases/purchase-invoices';

type StatusFilter = 'all' | PurchaseInvoiceStatusDto;
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'posted', 'cancelled'];

/**
 * Purchase invoices list. Creating and viewing an invoice are full pages now
 * (…/new and …/:id — see purchase-invoice-create-page / purchase-invoice-details-page),
 * no longer dialogs; a row click opens the invoice.
 */
export function PurchaseInvoicesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: invoices, isLoading } = usePurchaseInvoices();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const actions = usePurchaseInvoiceActions();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const poById = useMemo(() => new Map((purchaseOrders ?? []).map((po) => [po.id, po])), [purchaseOrders]);
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((c) => [c.id, c])), [suppliers]);

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

  const columns = useMemo<ColumnDef<PurchaseInvoiceDto>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: t('purchases.purchaseInvoices.invoiceNumber'),
        cell: ({ row }: { row: Row<PurchaseInvoiceDto> }) => (
          <span className="tabular font-semibold text-brand-700 dark:text-primary">
            {row.original.invoiceNumber}
          </span>
        ),
      },
      {
        id: 'supplier',
        header: t('purchases.purchaseInvoices.supplier'),
        accessorFn: (row: PurchaseInvoiceDto) => {
          const supplierId = poById.get(row.purchaseOrderId)?.supplierId;
          return (supplierId && supplierById.get(supplierId)?.name) || '—';
        },
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      {
        id: 'purchaseOrder',
        header: t('purchases.purchaseInvoices.purchaseOrder'),
        accessorFn: (row: PurchaseInvoiceDto) => poById.get(row.purchaseOrderId)?.poNumber ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'invoiceDate',
        header: t('purchases.purchaseInvoices.invoiceDate'),
        accessorFn: (row: PurchaseInvoiceDto) => row.invoiceDate ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'dueDate',
        header: t('purchases.purchaseInvoices.dueDate'),
        accessorFn: (row: PurchaseInvoiceDto) => row.dueDate ?? '—',
        cell: ({ getValue }) => (
          <span className="tabular text-secondary-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PurchaseInvoiceDto) => t(purchaseInvoiceStatusLabelKey(row.status)),
        cell: ({ row }: { row: Row<PurchaseInvoiceDto> }) => (
          <Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseInvoiceStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }: { row: Row<PurchaseInvoiceDto> }) => {
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
                  <DropdownMenuItem onSelect={() => navigate(`${PURCHASE_INVOICES_PATH}/${invoice.id}`)}>
                    {t('documents.open')}
                  </DropdownMenuItem>
                  <Can permission="purchases.manage">
                    {invoice.status === 'draft' ? (
                      <>
                        <DropdownMenuItem onSelect={() => void actions.post(invoice.id)}>
                          {t('purchases.purchaseInvoices.post')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void actions.cancel(invoice.id)}>
                          {t('purchases.purchaseInvoices.cancel')}
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
    [t, poById, supplierById, navigate, actions],
  );

  const newButton = (
    <Can permission="purchases.manage">
      <Button asChild>
        <Link to={`${PURCHASE_INVOICES_PATH}/new`}>
          <Plus />
          {t('purchases.purchaseInvoices.newInvoice')}
        </Link>
      </Button>
    </Can>
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      onRowClick={(invoice) => navigate(`${PURCHASE_INVOICES_PATH}/${invoice.id}`)}
      searchPlaceholder={t('common.search')}
      emptyState={
        statusFilter === 'all' ? (
          <EmptyState
            icon={<FileText />}
            title={t('purchases.purchaseInvoices.emptyTitle')}
            description={t('purchases.purchaseInvoices.emptyDescription')}
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
                {status === 'all' ? t('documents.all') : t(purchaseInvoiceStatusLabelKey(status))}
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
