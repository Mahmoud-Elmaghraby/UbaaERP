import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { JournalEntryWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useChartOfAccounts } from '../../api/chart-of-accounts/queries';
import { useCostCenters } from '../../api/cost-centers/queries';
import { formatMoney } from '../../../../lib/money';
import { JOURNAL_ENTRY_STATUS_VARIANT, journalEntryStatusLabelKey } from './journal-entry-status';

/** Read-only header + lines, same shape as every other entity's own details view.
 * `source` (manual/auto) and, for an auto-posted entry, its sourceReferenceType are
 * surfaced explicitly — a user browsing the ledger should be able to tell a COGS or
 * sales-return-reversal entry apart from one a person typed in by hand (see
 * AccountingAutoPostingListeners, claude/accounting-module-status.md). */
export function JournalEntryDetailsView({ entry }: { entry: JournalEntryWithLinesDto }) {
  const { t } = useTranslation();
  const { data: accounts } = useChartOfAccounts();
  const { data: costCenters } = useCostCenters();

  const accountById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const costCenterById = useMemo(() => new Map((costCenters ?? []).map((c) => [c.id, c])), [costCenters]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('accounting.journalEntries.entryNumber')}</p>
          <p className="font-medium">{entry.entryNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={JOURNAL_ENTRY_STATUS_VARIANT[entry.status]}>
            {t(journalEntryStatusLabelKey(entry.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('accounting.journalEntries.entryDate')}</p>
          <p className="font-medium">{entry.entryDate}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('accounting.journalEntries.source')}</p>
          <p className="font-medium">
            {t(`accounting.journalEntries.sourceValue.${entry.source}`)}
            {entry.source === 'auto' && entry.sourceReferenceType ? ` (${entry.sourceReferenceType})` : ''}
          </p>
        </div>
        {entry.reversalOfEntryId ? (
          <div>
            <p className="text-muted-foreground">{t('accounting.journalEntries.reversalOf')}</p>
            <p className="font-medium">{entry.reversalOfEntryId}</p>
          </div>
        ) : null}
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('accounting.journalEntries.description')}</p>
          <p className="font-medium">{entry.description ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('accounting.journalEntries.notes')}</p>
          <p className="font-medium">{entry.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('accounting.journalEntries.lineAccount')}</TableHead>
            <TableHead>{t('accounting.journalEntries.lineDebit')}</TableHead>
            <TableHead>{t('accounting.journalEntries.lineCredit')}</TableHead>
            <TableHead>{t('accounting.journalEntries.lineDescription')}</TableHead>
            <TableHead>{t('accounting.journalEntries.lineCostCenter')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {accountById.get(line.accountId)?.code ?? '—'} — {accountById.get(line.accountId)?.name ?? '—'}
              </TableCell>
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
              <TableCell>{line.description ?? '—'}</TableCell>
              <TableCell>
                {line.costCenterId
                  ? `${costCenterById.get(line.costCenterId)?.code ?? '—'} — ${costCenterById.get(line.costCenterId)?.name ?? '—'}`
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
          {entry.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
