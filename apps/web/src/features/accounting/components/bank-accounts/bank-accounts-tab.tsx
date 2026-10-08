import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { BankAccountDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@erp-platform/ui';

import { useBankAccounts } from '../../api/bank-accounts/queries';
import { BankAccountRegisterView } from './bank-account-register-view';

/**
 * Bank reconciliation: the treasuries linked to a chart account, each with its GL
 * register. Treasuries themselves are created and edited in the Treasury module.
 */
export function BankAccountsTab() {
  const { t } = useTranslation();
  const { data: bankAccounts, isLoading } = useBankAccounts();
  const [viewingRegisterId, setViewingRegisterId] = useState<string | null>(null);

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
      <p className="text-sm text-muted-foreground">
        {t('accounting.bankAccounts.managedInTreasury')}{' '}
        <Link className="text-primary hover:underline" to="/treasury">
          {t('treasury.title')}
        </Link>
      </p>

      <DataTable columns={columns} data={bankAccounts ?? []} isLoading={isLoading} />

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
