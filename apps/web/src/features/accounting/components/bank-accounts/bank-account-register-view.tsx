import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Can,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import {
  useBankAccountRegister,
  useReconcileLine,
  useUnreconcileLine,
} from '../../api/bank-accounts/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/money';

/** Bank account register — every posted line touching the bank's linked GL account,
 * in date order, with a running balance seeded from the bank account's own stored
 * openingBalance (BankAccountsService.getRegister() signs each line per
 * categoryCanonicalSide(glAccount.accountType), same discipline as
 * AccountingReportsService.generalLedger()). Same explicit-"Run"-button pattern as
 * the four AccountingReportsService reports — the date filters don't query on every
 * keystroke. */
export function BankAccountRegisterView({ bankAccountId }: { bankAccountId: string }) {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [runParams, setRunParams] = useState<{ fromDate?: string; toDate?: string } | null>({});

  const { data: register, isLoading } = useBankAccountRegister(bankAccountId, runParams);
  const reconcileLine = useReconcileLine();
  const unreconcileLine = useUnreconcileLine();

  function handleRun() {
    setRunParams({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  }

  async function handleToggleReconciled(lineId: string, isReconciled: boolean) {
    try {
      if (isReconciled) {
        await unreconcileLine.mutateAsync({ bankAccountId, lineId });
      } else {
        await reconcileLine.mutateAsync({ bankAccountId, lineId });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.bankAccounts.reconcileError'));
    }
  }

  const isTogglePending = reconcileLine.isPending || unreconcileLine.isPending;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.fromDate')}</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.toDate')}</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button className="justify-self-start" onClick={handleRun}>
          {t('accounting.reports.run')}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {register ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium">
            {t('accounting.reports.openingBalance')}:{' '}
            {formatMoney(register.openingBalance.amountMinorUnits, register.openingBalance.currency)}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('accounting.journalEntries.entryDate')}</TableHead>
                <TableHead>{t('accounting.journalEntries.entryNumber')}</TableHead>
                <TableHead>{t('accounting.journalEntries.description')}</TableHead>
                <TableHead>{t('accounting.journalEntries.lineDebit')}</TableHead>
                <TableHead>{t('accounting.journalEntries.lineCredit')}</TableHead>
                <TableHead>{t('accounting.reports.runningBalance')}</TableHead>
                <TableHead>{t('accounting.bankAccounts.reconciled')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {register.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.entryDate}</TableCell>
                  <TableCell>{line.entryNumber}</TableCell>
                  <TableCell>{line.description ?? '—'}</TableCell>
                  <TableCell>
                    {line.debitAmount.amountMinorUnits !== '0'
                      ? formatMoney(line.debitAmount.amountMinorUnits, line.debitAmount.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {line.creditAmount.amountMinorUnits !== '0'
                      ? formatMoney(line.creditAmount.amountMinorUnits, line.creditAmount.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {formatMoney(line.runningBalance.amountMinorUnits, line.runningBalance.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={line.isReconciled ? 'default' : 'secondary'}>
                      {t(
                        line.isReconciled
                          ? 'accounting.bankAccounts.reconciled'
                          : 'accounting.bankAccounts.unreconciled',
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Can permission="accounting.manage">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isTogglePending}
                        onClick={() => handleToggleReconciled(line.id, line.isReconciled)}
                      >
                        {t(
                          line.isReconciled
                            ? 'accounting.bankAccounts.unreconcile'
                            : 'accounting.bankAccounts.reconcile',
                        )}
                      </Button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
              {register.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="text-sm font-medium">
            {t('accounting.reports.closingBalance')}:{' '}
            {formatMoney(register.closingBalance.amountMinorUnits, register.closingBalance.currency)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
