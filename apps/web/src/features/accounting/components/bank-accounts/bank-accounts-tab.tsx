import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { BankAccountDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@erp-platform/ui';

import { useBankAccounts, useDeleteBankAccount } from '../../api/bank-accounts/queries';
import { ApiError } from '../../../../lib/api-client';
import { CreateBankAccountForm, EditBankAccountForm } from './bank-account-form';
import { BankAccountRegisterView } from './bank-account-register-view';

export function BankAccountsTab() {
  const { t } = useTranslation();
  const { data: bankAccounts, isLoading } = useBankAccounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountDto | null>(null);
  const [viewingRegisterId, setViewingRegisterId] = useState<string | null>(null);
  const deleteBankAccount = useDeleteBankAccount();

  async function handleDelete(id: string) {
    if (!window.confirm(t('accounting.bankAccounts.deleteConfirm'))) return;
    try {
      await deleteBankAccount.mutateAsync(id);
      toast.success(t('accounting.bankAccounts.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.bankAccounts.deleteError'));
    }
  }

  const columns = useMemo<ColumnDef<BankAccountDto>[]>(
    () => [
      { accessorKey: 'name', header: t('accounting.bankAccounts.name') },
      { accessorKey: 'bankName', header: t('accounting.bankAccounts.bankName') },
      { accessorKey: 'accountNumber', header: t('accounting.bankAccounts.accountNumber') },
      { accessorKey: 'currency', header: t('accounting.bankAccounts.currency') },
      {
        id: 'isActive',
        header: t('common.status'),
        cell: ({ row }: { row: Row<BankAccountDto> }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {t(row.original.isActive ? 'common.active' : 'common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<BankAccountDto> }) => {
          const bankAccount = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingRegisterId(bankAccount.id)}>
                  {t('accounting.bankAccounts.viewRegister')}
                </DropdownMenuItem>
                <Can permission="accounting.manage">
                  <>
                    <DropdownMenuItem onSelect={() => setEditing(bankAccount)}>
                      {t('common.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDelete(bankAccount.id)}>
                      {t('common.delete')}
                    </DropdownMenuItem>
                  </>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="accounting.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('accounting.bankAccounts.newBankAccount')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={bankAccounts ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.bankAccounts.newBankAccount')}</DialogTitle>
          </DialogHeader>
          <CreateBankAccountForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.bankAccounts.editBankAccount')}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EditBankAccountForm bankAccount={editing} onDone={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewingRegisterId !== null}
        onOpenChange={(open) => !open && setViewingRegisterId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.bankAccounts.register')}</DialogTitle>
          </DialogHeader>
          {viewingRegisterId ? <BankAccountRegisterView bankAccountId={viewingRegisterId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
