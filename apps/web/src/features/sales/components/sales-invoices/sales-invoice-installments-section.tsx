import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstallmentStatusDto, SalesInvoiceInstallmentScheduleDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';
import { CalendarClock, Plus, Trash2, Wand2 } from 'lucide-react';

import { SectionCard } from '../../../../components/document/document-layout';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { ApiError } from '../../../../lib/api-client';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { decimalToMinorUnits, formatAmount, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  useGenerateInstallmentsPreview,
  useInvoiceInstallments,
  useReplaceInvoiceInstallments,
} from '../../api/sales-invoices/installments';
import { SALES } from '../../../../lib/permissions';

export const INSTALLMENT_STATUS_VARIANT: Record<InstallmentStatusDto, 'success' | 'info' | 'neutral' | 'danger'> = {
  paid: 'success',
  partially_paid: 'info',
  due: 'neutral',
  overdue: 'danger',
};

/** "التقسيط" on the invoice page: the schedule with each installment's status, and the edit dialog. */
export function SalesInvoiceInstallmentsSection({
  invoiceId,
  invoiceDate,
  cancelled,
}: {
  invoiceId: string;
  invoiceDate: string | null;
  cancelled: boolean;
}) {
  const { t } = useTranslation();
  const { data: schedule } = useInvoiceInstallments(invoiceId);
  const [open, setOpen] = useState(false);
  if (!schedule) return null;
  const rows = schedule.installments;
  if (cancelled && rows.length === 0) return null;
  const canEdit = schedule.editable && BigInt(schedule.totalMinorUnits) > 0n;

  return (
    <SectionCard
      title={t('sales.installments.title')}
      description={rows.length ? t('sales.installments.count', { count: rows.length }) : t('sales.installments.none')}
      flush={rows.length > 0}
      actions={
        canEdit ? (
          <Can permission={SALES.create}>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <CalendarClock />
              {rows.length ? t('sales.installments.edit') : t('sales.installments.create')}
            </Button>
          </Can>
        ) : null
      }
    >
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>{t('sales.installments.dueDate')}</TableHead>
              <TableHead className={AMOUNT_CELL}>{t('sales.installments.amount')}</TableHead>
              <TableHead className={AMOUNT_CELL}>{t('sales.installments.paid')}</TableHead>
              <TableHead className={AMOUNT_CELL}>{t('sales.installments.remaining')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-center text-muted-foreground">{row.sequence}</TableCell>
                <TableCell>
                  <div className="flex flex-col leading-snug">
                    <span className="tabular-nums">{formatDate(row.dueDate)}</span>
                    {row.notes ? <span className="text-xs text-muted-foreground">{row.notes}</span> : null}
                  </div>
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={row.amountMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={row.paidMinorUnits} hideCurrency zeroAsDash />
                </TableCell>
                <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                  <Amount value={row.remainingMinorUnits} hideCurrency zeroAsDash />
                </TableCell>
                <TableCell>
                  <Badge variant={INSTALLMENT_STATUS_VARIANT[row.status]} dot>
                    {t(`sales.installments.status.${row.status}`)}
                  </Badge>
                  {row.overdueDays > 0 ? (
                    <span className="ms-2 text-xs text-danger">{t('sales.salesInvoices.overdueDays', { days: row.overdueDays })}</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">{canEdit ? t('sales.installments.emptyHint') : t('sales.installments.lockedHint')}</p>
      )}
      {rows.length > 0 && !schedule.editable && !cancelled ? (
        <p className="px-5 py-3 text-xs text-muted-foreground">{t('sales.installments.lockedHint')}</p>
      ) : null}
      {open ? (
        <InstallmentsDialog schedule={schedule} invoiceDate={invoiceDate} onClose={() => setOpen(false)} />
      ) : null}
    </SectionCard>
  );
}

interface EditableRow {
  key: number;
  dueDate: string;
  amount: string;
  notes: string;
}

let rowKey = 0;
const nextKey = () => ++rowKey;

function toMinor(value: string): bigint | null {
  try {
    const minor = BigInt(decimalToMinorUnits(value || '0'));
    return minor;
  } catch {
    return null;
  }
}

function InstallmentsDialog({
  schedule,
  invoiceDate,
  onClose,
}: {
  schedule: SalesInvoiceInstallmentScheduleDto;
  invoiceDate: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invoiceId = schedule.salesInvoiceId;
  const replace = useReplaceInvoiceInstallments(invoiceId);
  const preview = useGenerateInstallmentsPreview(invoiceId);
  const [rows, setRows] = useState<EditableRow[]>(() =>
    schedule.installments.map((i) => ({
      key: nextKey(),
      dueDate: i.dueDate,
      amount: minorUnitsToDecimalString(i.amountMinorUnits),
      notes: i.notes ?? '',
    })),
  );
  const [gen, setGen] = useState({
    count: '6',
    firstDueDate: todayIso(),
    intervalMonths: '1',
    downPayment: '',
    downPaymentDate: invoiceDate ?? todayIso(),
  });

  const total = BigInt(schedule.totalMinorUnits);
  const amounts = rows.map((r) => toMinor(r.amount));
  const invalid = amounts.some((a) => a === null || a <= 0n) || rows.some((r) => !r.dueDate);
  const sum = amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n);
  const difference = total - sum;

  async function generate() {
    const down = gen.downPayment.trim() ? toMinor(gen.downPayment) : 0n;
    const count = Number(gen.count);
    if (down === null || !Number.isInteger(count) || count < 1) {
      toast.error(t('sales.installments.invalidInput'));
      return;
    }
    try {
      const planned = await preview.mutateAsync({
        count,
        firstDueDate: gen.firstDueDate,
        intervalMonths: Number(gen.intervalMonths) || 1,
        ...(down > 0n ? { downPaymentMinorUnits: down.toString(), downPaymentDate: gen.downPaymentDate || undefined } : {}),
      });
      setRows(
        planned.map((p, index) => ({
          key: nextKey(),
          dueDate: p.dueDate,
          amount: minorUnitsToDecimalString(p.amountMinorUnits),
          notes: down > 0n && index === 0 ? t('sales.installments.downPayment') : '',
        })),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function save() {
    try {
      await replace.mutateAsync({
        installments: rows.map((r, i) => ({
          dueDate: r.dueDate,
          amountMinorUnits: (amounts[i] ?? 0n).toString(),
          notes: r.notes.trim() || null,
        })),
      });
      toast.success(t('sales.installments.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function removeSchedule() {
    if (!(await confirmDialog(t('sales.installments.removeConfirm'), { tone: 'danger' }))) return;
    try {
      await replace.mutateAsync({ installments: [] });
      toast.success(t('sales.installments.removed'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const update = (key: number, patch: Partial<EditableRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('sales.installments.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">{t('sales.installments.generateTitle')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="inst-count">{t('sales.installments.countLabel')}</Label>
              <Input id="inst-count" dir="ltr" inputMode="numeric" value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inst-first">{t('sales.installments.firstDueDate')}</Label>
              <Input id="inst-first" type="date" value={gen.firstDueDate} onChange={(e) => setGen({ ...gen, firstDueDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inst-interval">{t('sales.installments.intervalMonths')}</Label>
              <Input
                id="inst-interval"
                dir="ltr"
                inputMode="numeric"
                value={gen.intervalMonths}
                onChange={(e) => setGen({ ...gen, intervalMonths: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inst-down">{t('sales.installments.downPayment')}</Label>
              <Input
                id="inst-down"
                dir="ltr"
                inputMode="decimal"
                placeholder="0"
                value={gen.downPayment}
                onChange={(e) => setGen({ ...gen, downPayment: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inst-down-date">{t('sales.installments.downPaymentDate')}</Label>
              <Input
                id="inst-down-date"
                type="date"
                value={gen.downPaymentDate}
                onChange={(e) => setGen({ ...gen, downPaymentDate: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" className="w-full" onClick={() => void generate()} disabled={preview.isPending}>
                <Wand2 />
                {t('sales.installments.generate')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('sales.installments.generateHint')}</p>
        </div>

        <div className="grid gap-2">
          {rows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[2rem_1fr_1fr_1.4fr_auto] items-center gap-2">
              <span className="text-center text-sm text-muted-foreground">{index + 1}</span>
              <Input type="date" aria-label={t('sales.installments.dueDate')} value={row.dueDate} onChange={(e) => update(row.key, { dueDate: e.target.value })} />
              <Input
                dir="ltr"
                inputMode="decimal"
                aria-label={t('sales.installments.amount')}
                value={row.amount}
                className={toMinor(row.amount) === null || (toMinor(row.amount) ?? 0n) <= 0n ? 'border-danger' : undefined}
                onChange={(e) => update(row.key, { amount: e.target.value })}
              />
              <Input
                aria-label={t('sales.installments.notes')}
                placeholder={t('sales.installments.notes')}
                value={row.notes}
                onChange={(e) => update(row.key, { notes: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  {
                    key: nextKey(),
                    dueDate: list.at(-1)?.dueDate ?? todayIso(),
                    amount: difference > 0n ? minorUnitsToDecimalString(difference.toString()) : '',
                    notes: '',
                  },
                ])
              }
            >
              <Plus />
              {t('sales.installments.addRow')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span>
            {t('sales.installments.invoiceTotal')}:{' '}
            <Amount value={schedule.totalMinorUnits} currency={schedule.currency} />
          </span>
          <span>
            {t('sales.installments.scheduleTotal')}: <Amount value={sum.toString()} currency={schedule.currency} />
          </span>
          {difference !== 0n && rows.length > 0 ? (
            <span className="font-medium text-danger">
              {t('sales.installments.difference', { amount: formatAmount(difference.toString()) })}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            {schedule.installments.length > 0 ? (
              <Button variant="ghost" className="text-danger" onClick={() => void removeSchedule()} disabled={replace.isPending}>
                {t('sales.installments.remove')}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={replace.isPending || rows.length === 0 || invalid || difference !== 0n}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
