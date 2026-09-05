import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { CustomerDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@erp-platform/ui';

import { useCustomers, useDeleteCustomer } from '../../api/customers/queries';
import { CreateCustomerForm, EditCustomerForm } from './customer-form';
import { ApiError } from '../../../../lib/api-client';

export function CustomersTab() {
  const { t } = useTranslation();
  const { data: customers, isLoading } = useCustomers();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const deleteCustomer = useDeleteCustomer();

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.customers.deleteConfirm'))) return;
    try {
      await deleteCustomer.mutateAsync(id);
      toast.success(t('sales.customers.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<CustomerDto>[]>(
    () => [
      { accessorKey: 'code', header: t('sales.customers.code') },
      { accessorKey: 'name', header: t('sales.customers.name') },
      {
        id: 'customerType',
        header: t('sales.customers.customerType'),
        accessorFn: (row: CustomerDto) =>
          row.customerType === 'business'
            ? t('sales.customers.customerTypeBusiness')
            : t('sales.customers.customerTypeIndividual'),
      },
      {
        id: 'contactPerson',
        header: t('sales.customers.contactPerson'),
        accessorFn: (row: CustomerDto) => row.contactPerson ?? '—',
      },
      {
        id: 'phone',
        header: t('sales.customers.phone'),
        accessorFn: (row: CustomerDto) => row.phone ?? '—',
      },
      { accessorKey: 'defaultCurrency', header: t('sales.customers.defaultCurrency') },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row: CustomerDto) => row.isActive,
        cell: ({ row }: { row: Row<CustomerDto> }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<CustomerDto> }) => (
          <Can permission="sales.manage">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>{t('common.edit')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDelete(row.original.id)}>
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('sales.customers.subtitle')}</p>

      <DataTable
        columns={columns}
        data={customers ?? []}
        isLoading={isLoading}
        toolbar={
          <div className="flex justify-end">
            <Can permission="sales.manage">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">{t('sales.customers.newCustomer')}</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('sales.customers.newCustomer')}</DialogTitle>
                  </DialogHeader>
                  <CreateCustomerForm onDone={() => setCreateOpen(false)} />
                </DialogContent>
              </Dialog>
            </Can>
          </div>
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? <EditCustomerForm customer={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
