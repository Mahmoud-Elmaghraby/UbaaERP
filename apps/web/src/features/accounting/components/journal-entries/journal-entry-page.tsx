import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useHasPermission,
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';
import { useAccountingSettings } from '../../api/accounting-settings/queries';

import {
  useCancelJournalEntry,
  useDeleteJournalEntry,
  useJournalEntry,
  usePostJournalEntry,
} from '../../api/journal-entries/queries';
import { useChartOfAccounts } from '../../api/chart-of-accounts/queries';
import { useCostCenters } from '../../api/cost-centers/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate, formatDateTime } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { DocumentBody, DocumentHeaderBar, InfoGrid, PanelCard, SectionCard } from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { ENTITY_ROUTES } from '../../../../lib/entity-routes';
import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { ReverseJournalEntryForm } from './journal-entry-reverse-form';
import { JOURNAL_ENTRY_STATUS_VARIANT, journalEntryStatusLabelKey, sourceRefKey } from './journal-entry-status';

/** Where an automatic entry's source document lives in the app (when it has its own page). */
const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  ...ENTITY_ROUTES,
  inventory_goods_receipt: ENTITY_ROUTES.goods_receipt,
  goods_receipt_exchange_difference: ENTITY_ROUTES.goods_receipt,
  inventory_stock_count: ENTITY_ROUTES.stock_count,
  inventory_stock_adjustment: ENTITY_ROUTES.stock_adjustment,
  inventory_stock_transfer: ENTITY_ROUTES.stock_transfer,
  fixed_asset_disposal: ENTITY_ROUTES.fixed_asset,
  cheque_collected: ENTITY_ROUTES.payment_received,
  cheque_bounced: ENTITY_ROUTES.payment_received,
  cheque_cleared: ENTITY_ROUTES.supplier_payment,
  hr_payroll: (id) => `/hr/payroll/${id}`,
};

/** /accounting/journal-entries/:id — one entry: header, lines with totals, and what can be done with it. */
export function JournalEntryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: entry, isLoading, isError } = useJournalEntry(id);
  const { data: original } = useJournalEntry(entry?.reversalOfEntryId);
  const { data: accounts } = useChartOfAccounts();
  const { data: costCenters } = useCostCenters();
  const postEntry = usePostJournalEntry();
  const cancelEntry = useCancelJournalEntry();
  const deleteEntry = useDeleteJournalEntry();
  const [reversing, setReversing] = useState(false);
  const { data: settings } = useAccountingSettings();
  const canApprove = useHasPermission('accounting.approve');

  const accountById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const costCenterById = useMemo(() => new Map((costCenters ?? []).map((c) => [c.id, c])), [costCenters]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !entry) {
    return <EmptyState icon={<FileQuestion />} title={t('accounting.journalEntries.notFound')} />;
  }

  const manual = entry.source !== 'auto';
  // Approval on (manual entries) / review on (automatic ones): posting = approving.
  const approvalNeeded = settings ? (manual ? settings.requireEntryApproval : settings.reviewAutoEntries) : false;
  const totalDebit = entry.lines.reduce((sum, l) => sum + BigInt(l.debitAmount.amountMinorUnits), 0n);
  const totalCredit = entry.lines.reduce((sum, l) => sum + BigInt(l.creditAmount.amountMinorUnits), 0n);
  const hasCostCenters = entry.lines.some((l) => l.costCenterId);

  async function run(action: () => Promise<unknown>, success: string, error: string) {
    try {
      await action();
      toast.success(t(success));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(error));
    }
  }

  const sourceLink =
    entry.sourceReferenceType && entry.sourceReferenceId && SOURCE_ROUTES[entry.sourceReferenceType]
      ? SOURCE_ROUTES[entry.sourceReferenceType]!(entry.sourceReferenceId)
      : null;
  const sourceLabel = entry.sourceReferenceType
    ? t(`accounting.journalEntries.sourceRef.${sourceRefKey(entry.sourceReferenceType)}`, {
        defaultValue: t('accounting.journalEntries.sourceValue.auto'),
      })
    : t(`accounting.journalEntries.sourceValue.${entry.source}`);

  return (
    <div>
      <DocumentHeaderBar
        backTo="/accounting/journal-entries"
        backLabel={t('accounting.tabs.journalEntries')}
        eyebrow={t('accounting.tabs.journalEntries')}
        title={entry.entryNumber}
        status={
          <Badge variant={JOURNAL_ENTRY_STATUS_VARIANT[entry.status]} dot>
            {t(journalEntryStatusLabelKey(entry.status))}
          </Badge>
        }
        actions={
          <Can permission="accounting.manage">
            <>
              {entry.status === 'draft' && manual ? (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!(await confirmDialog(t('accounting.journalEntries.deleteConfirm'), { tone: 'danger' }))) return;
                      await run(
                        async () => {
                          await deleteEntry.mutateAsync(entry.id);
                          navigate('/accounting/journal-entries');
                        },
                        'accounting.journalEntries.deleteSuccess',
                        'accounting.journalEntries.deleteError',
                      );
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!(await confirmDialog(t('accounting.journalEntries.cancelConfirm'), { tone: 'danger' }))) return;
                      await run(
                        () => cancelEntry.mutateAsync(entry.id),
                        'accounting.journalEntries.cancelSuccess',
                        'accounting.journalEntries.cancelError',
                      );
                    }}
                  >
                    {t('accounting.journalEntries.cancel')}
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/accounting/journal-entries/${entry.id}/edit`)}>
                    {t('common.edit')}
                  </Button>
                </>
              ) : null}
              {entry.status === 'draft' && (!approvalNeeded || canApprove) ? (
                <Button
                  disabled={postEntry.isPending}
                  onClick={async () => {
                    if (!(await confirmDialog(t(approvalNeeded ? 'accounting.journalEntries.approveConfirm' : 'accounting.journalEntries.postConfirm')))) return;
                    await run(
                      () => postEntry.mutateAsync(entry.id),
                      'accounting.journalEntries.postSuccess',
                      'accounting.journalEntries.postError',
                    );
                  }}
                >
                  {t(approvalNeeded ? 'accounting.journalEntries.approveAndPost' : 'accounting.journalEntries.post')}
                </Button>
              ) : null}
              {entry.status === 'draft' && approvalNeeded && !canApprove ? (
                <Badge variant="warning">{t('accounting.journalEntries.awaitingApproval')}</Badge>
              ) : null}
              {entry.status === 'posted' ? (
                <Button variant="outline" onClick={() => setReversing(true)}>
                  {t('accounting.journalEntries.reverse')}
                </Button>
              ) : null}
            </>
          </Can>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard>
              <InfoGrid
                items={[
                  { label: t('accounting.journalEntries.entryDate'), value: formatDate(entry.entryDate) },
                  {
                    label: t('accounting.journalEntries.source'),
                    value: sourceLink ? (
                      <Link to={sourceLink} className="text-primary hover:underline">
                        {sourceLabel}
                      </Link>
                    ) : (
                      sourceLabel
                    ),
                  },
                  { label: t('accounting.journalEntries.postedAt'), value: entry.postedAt ? formatDateTime(entry.postedAt) : '—' },
                  ...(entry.reversalOfEntryId
                    ? [
                        {
                          label: t('accounting.journalEntries.reversalOf'),
                          value: (
                            <Link to={`/accounting/journal-entries/${entry.reversalOfEntryId}`} className="text-primary hover:underline">
                              {original?.entryNumber ?? t('accounting.journalEntries.openOriginal')}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  { label: t('accounting.journalEntries.description'), value: entry.description ?? '—', wide: true },
                  ...(entry.notes ? [{ label: t('accounting.journalEntries.notes'), value: entry.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard title={t('accounting.journalEntries.lines')} flush>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('accounting.journalEntries.lineAccount')}</TableHead>
                      <TableHead>{t('accounting.journalEntries.lineDescription')}</TableHead>
                      {hasCostCenters ? <TableHead>{t('accounting.journalEntries.lineCostCenter')}</TableHead> : null}
                      <TableHead className={cn(AMOUNT_CELL, 'w-40')}>{t('accounting.journalEntries.lineDebit')}</TableHead>
                      <TableHead className={cn(AMOUNT_CELL, 'w-40')}>{t('accounting.journalEntries.lineCredit')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.lines.map((line) => {
                      const account = accountById.get(line.accountId);
                      const center = line.costCenterId ? costCenterById.get(line.costCenterId) : undefined;
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <Link
                              to={`/accounting/reports/general-ledger?account=${line.accountId}&from=${entry.entryDate.slice(0, 4)}-01-01&to=${entry.entryDate}`}
                              className="hover:underline"
                            >
                              <span className="me-2 tabular-nums text-muted-foreground">{account?.code}</span>
                              {account?.name ?? '—'}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{line.description ?? '—'}</TableCell>
                          {hasCostCenters ? <TableCell>{center ? `${center.code} — ${center.name}` : '—'}</TableCell> : null}
                          <TableCell className={AMOUNT_CELL}>
                            <Amount value={line.debitAmount.amountMinorUnits} hideCurrency zeroAsDash />
                          </TableCell>
                          <TableCell className={AMOUNT_CELL}>
                            <Amount value={line.creditAmount.amountMinorUnits} hideCurrency zeroAsDash />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell colSpan={hasCostCenters ? 3 : 2}>
                        {t('accounting.reports.total')} <span className="text-xs font-normal text-muted-foreground">({entry.currency})</span>
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={totalDebit.toString()} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={totalCredit.toString()} hideCurrency />
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </SectionCard>
            {!manual ? (
              <p className="text-sm text-muted-foreground">{t('accounting.journalEntries.autoHint')}</p>
            ) : null}
          </>
        }
        side={
          <>
            <PanelCard>
              <AttachmentsPanel entityType="journal_entry" entityId={entry.id} />
            </PanelCard>
            <DocumentHistory entityType="journal_entry" entityId={entry.id} />
          </>
        }
      />

      <Dialog open={reversing} onOpenChange={setReversing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounting.journalEntries.reverse')}</DialogTitle>
          </DialogHeader>
          <ReverseJournalEntryForm entryId={entry.id} onDone={() => setReversing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
