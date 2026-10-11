import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import type { ChannelSettlementLineDto, SettlementLineKindDto, SettlementMatchDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
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
  toast,
} from '@erp-platform/ui';

import { ApiError } from '../../lib/api-client';
import { decimalToMinorUnits, formatAmount, minorUnitsToDecimalString } from '../../lib/money';
import { useTreasuryCategories } from '../treasury/api/queries';
import { useChannelSettlement, useDeleteSettlement, usePostSettlement, useSalesChannels, useSaveSettlement } from './api';
import { SETTLEMENTS_PATH } from './settlements-page';
import { StatementImportDialog, type ImportedLine } from './statement-import-dialog';
import { confirmDialog } from '../../components/feedback/confirm-dialog';

interface DraftLine {
  key: string;
  kind: SettlementLineKindDto;
  externalReference: string;
  description: string;
  amount: string;
  categoryId: string;
  /** From the last save — shown until the line is edited. */
  saved?: ChannelSettlementLineDto;
}

const NONE = '__none__';
const MATCH_VARIANT: Record<SettlementMatchDto, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  matched: 'success',
  amount_mismatch: 'warning',
  unmatched: 'danger',
  already_paid: 'info',
  not_applicable: 'neutral',
};
let keySeq = 0;
const newKey = () => `l${(keySeq += 1)}`;

function toMinor(text: string): bigint | null {
  try {
    const minor = BigInt(decimalToMinorUnits(text.trim() || '0'));
    return minor > 0n ? minor : null;
  } catch {
    return null;
  }
}

/**
 * One marketplace statement: header + lines (paid orders, refunds, fees),
 * typed or imported from the platform's file. Saving matches each order to
 * the channel's invoice by the platform order number; posting records the
 * receipt and the fees (see ChannelSettlementsService).
 */
export function SettlementEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data: settlement, isLoading } = useChannelSettlement(isNew ? undefined : id);
  const { data: channels } = useSalesChannels();
  const { data: expenseItems } = useTreasuryCategories('expense');
  const save = useSaveSettlement();
  const post = usePostSettlement();
  const remove = useDeleteSettlement();
  const [importOpen, setImportOpen] = useState(false);
  const [header, setHeader] = useState({ channelId: '', statementDate: new Date().toLocaleDateString('en-CA'), periodFrom: '', periodTo: '', reference: '' });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const marketplaces = (channels ?? []).filter((c) => c.kind === 'marketplace' && c.isActive);
  const readOnly = settlement ? settlement.status !== 'draft' : false;

  useEffect(() => {
    if (!settlement) return;
    setHeader({
      channelId: settlement.salesChannelId,
      statementDate: settlement.statementDate,
      periodFrom: settlement.periodFrom ?? '',
      periodTo: settlement.periodTo ?? '',
      reference: settlement.statementReference ?? '',
    });
    setLines(
      settlement.lines.map((line) => ({
        key: newKey(),
        kind: line.kind,
        externalReference: line.externalReference ?? '',
        description: line.description ?? '',
        amount: minorUnitsToDecimalString(line.amount.amountMinorUnits),
        categoryId: line.categoryId ?? '',
        saved: line,
      })),
    );
  }, [settlement]);

  useEffect(() => {
    if (isNew && !header.channelId && marketplaces.length === 1) setHeader((h) => ({ ...h, channelId: marketplaces[0]!.id }));
  }, [isNew, header.channelId, marketplaces]);

  const totals = useMemo(() => {
    const sum = (kind: SettlementLineKindDto) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + (toMinor(l.amount) ?? 0n), 0n);
    const orders = sum('order');
    const refunds = sum('refund');
    const fees = sum('fee');
    return { orders, refunds, fees, net: orders - refunds - fees };
  }, [lines]);

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch, saved: undefined } : l)));
  const addLine = (kind: SettlementLineKindDto) =>
    setLines((all) => [...all, { key: newKey(), kind, externalReference: '', description: '', amount: '', categoryId: '' }]);

  function onImport(imported: ImportedLine[]) {
    setLines((all) => [
      ...all.filter((l) => l.amount.trim()),
      ...imported.map((line) => ({
        key: newKey(),
        kind: line.kind,
        externalReference: line.externalReference ?? '',
        description: line.description ?? '',
        amount: minorUnitsToDecimalString(line.amountMinor.toString()),
        categoryId: line.categoryId ?? '',
      })),
    ]);
    toast.success(t('settlements.import.done', { count: imported.length }));
  }

  async function onSave(): Promise<string | null> {
    const payload = [];
    for (const line of lines) {
      const minor = toMinor(line.amount);
      if (minor === null) {
        toast.error(t('settlements.invalidAmount'));
        return null;
      }
      payload.push({
        kind: line.kind,
        externalReference: line.externalReference.trim() || null,
        description: line.description.trim() || null,
        amountMinorUnits: minor.toString(),
        categoryId: line.kind === 'fee' ? line.categoryId || null : null,
      });
    }
    try {
      const saved = await save.mutateAsync({
        id: isNew ? undefined : id,
        input: {
          salesChannelId: header.channelId,
          statementDate: header.statementDate,
          periodFrom: header.periodFrom || null,
          periodTo: header.periodTo || null,
          statementReference: header.reference.trim() || null,
          lines: payload,
        },
      });
      toast.success(t('settlements.saved'));
      if (isNew) navigate(`${SETTLEMENTS_PATH}/${saved.id}`, { replace: true });
      return saved.id;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      return null;
    }
  }

  async function onPost() {
    if (!(await confirmDialog(t('settlements.postConfirm', { net: formatAmount(totals.net.toString()) })))) return;
    const savedId = await onSave();
    if (!savedId) return;
    try {
      await post.mutateAsync(savedId);
      toast.success(t('settlements.posted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!id || !(await confirmDialog(t('settlements.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(id);
      navigate(SETTLEMENTS_PATH);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  if (!isNew && !isLoading && !settlement) return <EmptyState title={t('documents.notFound')} />;
  const unmatched = lines.filter((l) => l.saved && (l.saved.match === 'unmatched' || l.saved.match === 'already_paid')).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link to={SETTLEMENTS_PATH} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="size-4" />
            {t('documents.back')}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {settlement ? settlement.settlementNumber : t('settlements.new')}
            {settlement ? (
              <Badge variant={settlement.status === 'posted' ? 'success' : 'warning'} dot>
                {t(`settlements.statuses.${settlement.status}`)}
              </Badge>
            ) : null}
          </h1>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            {!isNew ? (
              <Button variant="ghost" onClick={onDelete}>
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void onSave()} disabled={save.isPending || !header.channelId || lines.length === 0}>
              {t('settlements.saveDraft')}
            </Button>
            <Button onClick={onPost} disabled={post.isPending || save.isPending || !header.channelId || lines.length === 0}>
              {t('settlements.post')}
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-5">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>{t('settlements.channel')}</Label>
            <Select value={header.channelId || NONE} onValueChange={(v) => setHeader({ ...header, channelId: v === NONE ? '' : v })} disabled={readOnly}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('channels.choose')}</SelectItem>
                {marketplaces.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {marketplaces.length === 0 ? (
              <Link to="/sales/channels" className="text-xs text-primary hover:underline">
                {t('settlements.noChannels')}
              </Link>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>{t('settlements.statementDate')}</Label>
            <Input type="date" value={header.statementDate} disabled={readOnly} onChange={(e) => setHeader({ ...header, statementDate: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('settlements.periodFrom')}</Label>
            <Input type="date" value={header.periodFrom} disabled={readOnly} onChange={(e) => setHeader({ ...header, periodFrom: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('settlements.periodTo')}</Label>
            <Input type="date" value={header.periodTo} disabled={readOnly} onChange={(e) => setHeader({ ...header, periodTo: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['orders', totals.orders],
            ['refunds', totals.refunds],
            ['fees', totals.fees],
            ['net', totals.net],
          ] as const
        ).map(([key, value]) => (
          <Card key={key}>
            <CardContent className="grid gap-1 pt-5">
              <span className="text-xs text-muted-foreground">{t(`settlements.${key}`)}</span>
              <span className={`tabular text-xl font-semibold ${key === "net" ? (value < 0n ? "text-danger" : "text-primary") : ""}`}>{formatAmount(value.toString())}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {unmatched > 0 ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t('settlements.unmatchedWarning', { count: unmatched })}</p> : null}

      <Card>
        <CardContent className="grid gap-3 p-0">
          {!readOnly ? (
            <div className="flex flex-wrap gap-2 border-b p-3">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!header.channelId}>
                <FileSpreadsheet className="size-4" />
                {t('settlements.importFile')}
              </Button>
              {(['order', 'refund', 'fee'] as const).map((kind) => (
                <Button key={kind} variant="ghost" size="sm" onClick={() => addLine(kind)}>
                  <Plus className="size-4" />
                  {t(`settlements.add.${kind}`)}
                </Button>
              ))}
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{t('settlements.kind')}</TableHead>
                <TableHead>{t('channels.orderRef')}</TableHead>
                <TableHead>{t('settlements.description')}</TableHead>
                <TableHead className="w-36">{t('settlements.amount')}</TableHead>
                <TableHead>{t('settlements.match')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>
                    <Select value={line.kind} disabled={readOnly} onValueChange={(v) => update(line.key, { kind: v as SettlementLineKindDto })}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['order', 'refund', 'fee'] as const).map((k) => (
                          <SelectItem key={k} value={k}>
                            {t(`settlements.kinds.${k}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {line.kind !== 'fee' ? (
                      <Input className="h-8 font-mono text-xs" dir="ltr" value={line.externalReference} disabled={readOnly} onChange={(e) => update(line.key, { externalReference: e.target.value })} />
                    ) : (
                      <Select value={line.categoryId || NONE} disabled={readOnly} onValueChange={(v) => update(line.key, { categoryId: v === NONE ? '' : v })}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={t('settlements.category')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('settlements.category')}</SelectItem>
                          {(expenseItems ?? []).filter((c) => c.isActive).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" value={line.description} disabled={readOnly} onChange={(e) => update(line.key, { description: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 text-end tabular" dir="ltr" inputMode="decimal" value={line.amount} disabled={readOnly} onChange={(e) => update(line.key, { amount: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    {line.saved && line.saved.match !== 'not_applicable' ? (
                      <div className="grid gap-0.5">
                        <Badge variant={MATCH_VARIANT[line.saved.match]}>{t(`settlements.matches.${line.saved.match}`)}</Badge>
                        {line.saved.salesInvoiceNumber ? (
                          <span className="text-xs text-muted-foreground">
                            {line.saved.salesInvoiceNumber}
                            {line.saved.match === 'amount_mismatch' && line.saved.invoiceOutstanding
                              ? ` — ${t('settlements.expected')} ${formatAmount(line.saved.invoiceOutstanding.amountMinorUnits)}`
                              : ''}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {!readOnly ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.delete')} onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t('settlements.noLines')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {settlement?.status === 'posted' ? <p className="text-sm text-muted-foreground">{t('settlements.postedHint')}</p> : null}

      <StatementImportDialog open={importOpen} onOpenChange={setImportOpen} channelId={header.channelId} onImport={onImport} />
    </div>
  );
}
