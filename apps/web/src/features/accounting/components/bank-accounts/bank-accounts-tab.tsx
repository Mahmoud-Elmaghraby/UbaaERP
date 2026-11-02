import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { BankAccountDto } from '@erp-platform/contracts';
import { Badge, Button, DataTable } from '@erp-platform/ui';

import { useBankAccounts } from '../../api/bank-accounts/queries';

/** Bank accounts (kept in Treasury) — a row opens its reconciliation. */
export function BankAccountsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: bankAccounts, isLoading } = useBankAccounts();

  const columns = useMemo<ColumnDef<BankAccountDto>[]>(
    () => [
      { accessorKey: 'name', header: t('accounting.bankAccounts.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { accessorKey: 'bankName', header: t('accounting.bankAccounts.bankName') },
      { accessorKey: 'accountNumber', header: t('accounting.bankAccounts.accountNumber'), cell: ({ row }) => <span dir="ltr" className="tabular-nums">{row.original.accountNumber}</span> },
      { accessorKey: 'currency', header: t('accounting.bankAccounts.currency') },
      {
        id: 'isActive',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {t(row.original.isActive ? 'common.active' : 'common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'open',
        header: '',
        cell: () => (
          <Button variant="outline" size="sm">
            {t('accounting.bankAccounts.reconcile')}
          </Button>
        ),
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
      <DataTable
        columns={columns}
        data={bankAccounts ?? []}
        isLoading={isLoading}
        onRowClick={(account) => navigate(`/accounting/bank-accounts/${account.id}`)}
      />
    </div>
  );
}
