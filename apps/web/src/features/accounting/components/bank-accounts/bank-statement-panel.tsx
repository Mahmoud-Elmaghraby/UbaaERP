import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BankStatementLineDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { BookPlus, Check, EyeOff, FileUp, Link2, MoreHorizontal, RotateCcw, Trash2, Unlink } from 'lucide-react';

import {
  useBankStatement,
  useBookStatementLine,
  useImportBankStatement,
  useStatementLineAction,
} from '../../api/accounting-completion/queries';
import { ApiError } from '../../../../lib/api-client';
import { readSpreadsheet } from '../../../../lib/xlsx';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { ReportSection } from '../../../../components/report/report-layout';
import { AccountPicker } from '../account-picker';
import { guessMapping, parseStatement, type StatementMapping } from './statement-parsing';

const STATUS_VARIANT = { unmatched: 'warning', matched: 'success', ignored: 'neutral' } as const;

/** The bank-statement half of reconciliation: imported lines, each matched to a book movement or booked. */
export function BankStatementPanel({ bankAccountId, from, to, currency }: { bankAccountId: string; from: string; to: string; currency: string }) {
  const { t } = useTranslation();
  const { data: lines, isLoading } = useBankStatement(bankAccountId, { fromDate: from, toDate: to });
  const action = useStatementLineAction(bankAccountId);
  const canManage = useHasPermission('accounting.manage');
  const [importing, setImporting] = useState(false);
  const [booking, setBooking] = useState<BankStatementLineDto | null>(null);

  const summary = useMemo(() => {
    const all = lines ?? [];
    const total = all.reduce((s, l) => s + BigInt(l.amountMinorUnits), 0n);
    const open = all.filter((l) => l.status === 'unmatched');
    return { total, count: all.length, openCount: open.length, open: open.reduce((s, l) => s + BigInt(l.amountMinorUnits), 0n) };
  }, [lines]);

  async function run(line: BankStatementLineDto, kind: 'match' | 'unmatch' | 'ignore' | 'restore' | 'delete', journalLineId?: string) {
    try {
      await action.mutateAsync({ lineId: line.id, action: kind, journalLineId });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label={t('accounting.bankStatement.movement', { count: summary.count })} value={summary.total.toString()} currency={currency} />
        <MiniStat label={t('accounting.bankStatement.unmatched', { count: summary.openCount })} value={summary.open.toString()} currency={currency} warn={summary.openCount > 0} />
        <div className="flex items-center justify-end">
          {canManage ? (
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileUp className="me-1 h-4 w-4" />
              {t('accounting.bankStatement.import')}
            </Button>
          ) : null}
        </div>
      </div>
      <ReportSection>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t('accounting.journalEntries.entryDate')}</TableHead>
              <TableHead>{t('accounting.bankStatement.description')}</TableHead>
              <TableHead className={AMOUNT_CELL}>{t('accounting.bankAccounts.deposit')}</TableHead>
              <TableHead className={AMOUNT_CELL}>{t('accounting.bankAccounts.withdrawal')}</TableHead>
              <TableHead className="w-[30%]">{t('accounting.bankStatement.match')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lines ?? []).map((line) => {
              const amount = BigInt(line.amountMinorUnits);
              return (
                <TableRow key={line.id} className={cn(line.status !== 'unmatched' && 'text-muted-foreground')}>
                  <TableCell className="tabular-nums">{formatDate(line.date)}</TableCell>
                  <TableCell className="max-w-[22rem]">
                    <span className="line-clamp-1">{line.description ?? '—'}</span>
                    {line.reference ? <span className="text-xs text-muted-foreground">{line.reference}</span> : null}
                  </TableCell>
                  <TableCell className={AMOUNT_CELL}>{amount > 0n ? <Amount value={line.amountMinorUnits} hideCurrency /> : null}</TableCell>
                  <TableCell className={AMOUNT_CELL}>{amount < 0n ? <Amount value={(-amount).toString()} hideCurrency /> : null}</TableCell>
                  <TableCell>
                    {line.status === 'unmatched' && line.suggestions.length > 0 && canManage ? (
                      <div className="flex flex-wrap gap-1.5">
                        {line.suggestions.slice(0, 2).map((s) => (
                          <Button
                            key={s.lineId}
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-success/40 text-success hover:bg-success-soft"
                            disabled={action.isPending}
                            title={s.description ?? undefined}
                            onClick={() => run(line, 'match', s.lineId)}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {s.entryNumber} · {formatDate(s.entryDate)}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Badge variant={STATUS_VARIANT[line.status]} dot>
                        {t(`accounting.bankStatement.statuses.${line.status}`)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {line.status === 'unmatched' ? (
                            <>
                              <DropdownMenuItem onClick={() => setBooking(line)}>
                                <BookPlus className="me-2 h-4 w-4" />
                                {t('accounting.bankStatement.book')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => run(line, 'ignore')}>
                                <EyeOff className="me-2 h-4 w-4" />
                                {t('accounting.bankStatement.ignore')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => run(line, 'delete')} className="text-destructive">
                                <Trash2 className="me-2 h-4 w-4" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </>
                          ) : line.status === 'matched' ? (
                            <DropdownMenuItem onClick={() => run(line, 'unmatch')}>
                              <Unlink className="me-2 h-4 w-4" />
                              {t('accounting.bankStatement.unmatch')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => run(line, 'restore')}>
                              <RotateCcw className="me-2 h-4 w-4" />
                              {t('accounting.bankStatement.restore')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && (lines ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {t('accounting.bankStatement.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </ReportSection>
      <ImportStatementDialog bankAccountId={bankAccountId} open={importing} onOpenChange={setImporting} />
      <BookLineDialog bankAccountId={bankAccountId} line={booking} onClose={() => setBooking(null)} />
    </>
  );
}

function MiniStat({ label, value, currency, warn }: { label: string; value: string; currency: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', warn && 'text-warning')}>
        <Amount value={value} currency={currency} />
      </p>
    </div>
  );
}

const NONE = '-1';
const MAPPING_KEY = 'bank-statement-mapping';

function ImportStatementDialog({ bankAccountId, open, onOpenChange }: { bankAccountId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const importStatement = useImportBankStatement(bankAccountId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<StatementMapping | null>(null);

  const header = rows?.[headerRow] ?? [];
  const parsed = useMemo(() => (rows && mapping ? parseStatement(rows.slice(headerRow + 1), mapping) : null), [rows, headerRow, mapping]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await readSpreadsheet(file);
      // The header is the first row that names a date column.
      const index = Math.max(0, data.findIndex((row) => row.some((c) => /date|تاريخ/i.test(c))));
      setRows(data);
      setHeaderRow(index);
      let saved: StatementMapping | null = null;
      try {
        const raw = localStorage.getItem(`${MAPPING_KEY}:${bankAccountId}`);
        saved = raw ? (JSON.parse(raw) as StatementMapping) : null;
      } catch {
        saved = null;
      }
      setMapping(saved && Math.max(...Object.values(saved)) < (data[index]?.length ?? 0) ? saved : guessMapping(data[index] ?? []));
    } catch {
      toast.error(t('accounting.bankStatement.badFile'));
    }
  }

  async function confirm() {
    if (!parsed || parsed.lines.length === 0 || !mapping) return;
    try {
      const result = await importStatement.mutateAsync({ lines: parsed.lines });
      try {
        localStorage.setItem(`${MAPPING_KEY}:${bankAccountId}`, JSON.stringify(mapping));
      } catch {
        /* not remembered */
      }
      toast.success(t('accounting.bankStatement.imported', { count: result.imported, matched: result.matched }));
      setRows(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const column = (key: keyof StatementMapping, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select
        value={String(mapping?.[key] ?? -1)}
        onValueChange={(v) => setMapping((m) => (m ? { ...m, [key]: Number(v) } : m))}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {header.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {h || t('accounting.bankStatement.columnN', { n: i + 1 })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setRows(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('accounting.bankStatement.importTitle')}</DialogTitle>
        </DialogHeader>
        {!rows ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50"
          >
            <FileUp className="h-8 w-8" />
            <span className="font-medium text-foreground">{t('accounting.bankStatement.chooseFile')}</span>
            <span>{t('accounting.bankStatement.fileHint')}</span>
          </button>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {column('dateCol', t('accounting.bankStatement.dateColumn'))}
              {column('descriptionCol', t('accounting.bankStatement.descriptionColumn'))}
              {column('referenceCol', t('accounting.bankStatement.referenceColumn'))}
              {column('amountCol', t('accounting.bankStatement.amountColumn'))}
              {column('depositCol', t('accounting.bankStatement.depositColumn'))}
              {column('withdrawalCol', t('accounting.bankStatement.withdrawalColumn'))}
            </div>
            <p className="text-xs text-muted-foreground">{t('accounting.bankStatement.amountHint')}</p>
            {parsed ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableBody>
                    {parsed.lines.slice(0, 8).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="tabular-nums">{formatDate(line.date)}</TableCell>
                        <TableCell className="max-w-[20rem] truncate">{line.description ?? '—'}</TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={line.amountMinorUnits} hideCurrency />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <p className="text-sm">
              {t('accounting.bankStatement.preview', { count: parsed?.lines.length ?? 0, skipped: parsed?.skipped ?? 0 })}
            </p>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!parsed || parsed.lines.length === 0 || importStatement.isPending}>
            <Check className="me-1 h-4 w-4" />
            {t('accounting.bankStatement.importConfirm', { count: parsed?.lines.length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookLineDialog({ bankAccountId, line, onClose }: { bankAccountId: string; line: BankStatementLineDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const book = useBookStatementLine(bankAccountId);
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');

  async function confirm() {
    if (!line || !accountId) return;
    try {
      await book.mutateAsync({ lineId: line.id, input: { counterAccountId: accountId, description: description.trim() || null } });
      toast.success(t('accounting.bankStatement.booked'));
      setAccountId('');
      setDescription('');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('accounting.bankStatement.bookTitle')}</DialogTitle>
        </DialogHeader>
        {line ? (
          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span>
                {formatDate(line.date)} · {line.description ?? '—'}
              </span>
              <Amount value={line.amountMinorUnits} className="font-semibold" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('accounting.bankStatement.counterAccount')}</Label>
              <AccountPicker value={accountId || null} onChange={(id) => setAccountId(id)} />
              <p className="text-xs text-muted-foreground">{t('accounting.bankStatement.counterHint')}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="book-desc">{t('accounting.journalEntries.description')}</Label>
              <Input id="book-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={line.description ?? ''} />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!accountId || book.isPending}>
            {t('accounting.bankStatement.bookConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
