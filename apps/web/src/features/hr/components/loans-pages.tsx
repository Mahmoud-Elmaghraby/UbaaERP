import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { LoanStatusDto, LoanSummaryDto, PayAdjustmentDto, PayAdjustmentKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { Plus, Trash2 } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { decimalToMinorUnits, formatAmount, formatMoney, minorUnitsToDecimalString } from '../../../lib/money';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { TreasurySelect } from '../../../components/document/treasury-select';
import { useBaseCurrency } from '../../settings/queries';
import {
  useCreateLoan,
  useCreatePayAdjustments,
  useDeletePayAdjustment,
  useDepartments,
  useEmployees,
  useLoan,
  useLoanAction,
  useLoans,
  usePayAdjustments,
  type LoanAction,
} from '../api/queries';

const ALL = '__all__';
const NONE = '__none__';
const STATUS_VARIANT: Record<LoanStatusDto, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  pending: 'warning',
  approved: 'info',
  active: 'success',
  closed: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
};

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** A positive decimal amount → minor units, or null when invalid. */
function toMinor(text: string): string | null {
  try {
    const minor = decimalToMinorUnits(text);
    return BigInt(minor) > 0n ? minor : null;
  } catch {
    return null;
  }
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── loans ─────────────────────────────────────────────────────────────────

/** السلف — request, approve, pay out of a treasury, take cash back, postpone a month. */
export function LoansPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LoanStatusDto | 'open' | ''>('open');
  const { data, isLoading } = useLoans(status === 'open' ? { open: 'true' } : { status: status || undefined });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<LoanSummaryDto>[]>(
    () => [
      { accessorKey: 'number', header: t('hr.loans.number'), cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.number}</span> },
      {
        id: 'employee',
        header: t('hr.attendance.employee'),
        accessorFn: (r) => `${r.employeeName} ${r.employeeCode}`,
        cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span>,
      },
      { id: 'amount', header: t('hr.loans.amount'), cell: ({ row }) => <span className="tabular-nums">{formatAmount(row.original.amountMinorUnits)}</span> },
      { id: 'installments', header: t('hr.loans.installments'), cell: ({ row }) => `${row.original.installmentCount} × ${t('hr.loans.from')} ${row.original.firstMonth}` },
      {
        id: 'remaining',
        header: t('hr.loans.remaining'),
        cell: ({ row }) => <span className="font-semibold tabular-nums">{formatAmount(row.original.remainingMinorUnits)}</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{t(`hr.loans.statuses.${row.original.status}`)}</Badge>,
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.loans.title')}
        description={t('hr.loans.subtitle')}
        actions={
          <Can permission={HR.loansManage}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.loans.add')}
            </Button>
          </Can>
        }
      />
      <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : (v as LoanStatusDto | 'open'))}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">{t('hr.loans.openOnly')}</SelectItem>
          <SelectItem value={ALL}>{t('hr.employees.allStatuses')}</SelectItem>
          {(['pending', 'approved', 'active', 'closed', 'rejected', 'cancelled'] as const).map((s) => (
            <SelectItem key={s} value={s}>
              {t(`hr.loans.statuses.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable searchPlaceholder={t('hr.employees.search')} onRowClick={(l) => setOpenId(l.id)} />
      <NewLoanDialog open={creating} onClose={() => setCreating(false)} />
      <LoanDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function NewLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateLoan();
  const { data: employees } = useEmployees({ status: 'active' });
  const blank = { employeeId: '', amount: '', mode: 'count' as 'count' | 'amount', count: '1', per: '', firstMonth: thisMonth(), reason: '' };
  const [form, setForm] = useState(blank);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(blank);
  }
  const amount = toMinor(form.amount);
  const count = Number(form.count);
  const per = toMinor(form.per);
  const valid =
    form.employeeId && amount && /^\d{4}-\d{2}$/.test(form.firstMonth) && (form.mode === 'count' ? Number.isInteger(count) && count >= 1 && count <= 120 : per);
  const perPreview = amount && form.mode === 'count' && valid ? formatAmount((BigInt(amount) / BigInt(count)).toString()) : null;

  async function submit() {
    if (!valid) return;
    try {
      await create.mutateAsync({
        employeeId: form.employeeId,
        amountMinorUnits: amount!,
        ...(form.mode === 'count' ? { installmentCount: count } : { installmentMinorUnits: per! }),
        firstMonth: form.firstMonth,
        reason: form.reason.trim() || null,
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('hr.loans.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('hr.attendance.employee')}</Label>
            <Select value={form.employeeId || NONE} onValueChange={(v) => setForm({ ...form, employeeId: v === NONE ? '' : v })}>
              <SelectTrigger>
                <SelectValue placeholder={t('hr.leaves.pickEmployee')} />
              </SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName} ({e.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ln-amount">{t('hr.loans.amount')}</Label>
              <Input id="ln-amount" dir="ltr" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ln-first">{t('hr.loans.firstMonth')}</Label>
              <Input id="ln-first" type="month" value={form.firstMonth} onChange={(e) => setForm({ ...form, firstMonth: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('hr.loans.splitBy')}</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as 'count' | 'amount' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">{t('hr.loans.byCount')}</SelectItem>
                  <SelectItem value="amount">{t('hr.loans.byAmount')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ln-split">{form.mode === 'count' ? t('hr.loans.installmentCount') : t('hr.loans.installmentAmount')}</Label>
              <Input
                id="ln-split"
                dir="ltr"
                inputMode="decimal"
                value={form.mode === 'count' ? form.count : form.per}
                onChange={(e) => setForm(form.mode === 'count' ? { ...form, count: e.target.value } : { ...form, per: e.target.value })}
              />
            </div>
          </div>
          {perPreview ? <p className="text-xs text-muted-foreground">{t('hr.loans.perPreview', { amount: perPreview })}</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="ln-reason">{t('hr.leaves.reason')}</Label>
            <Textarea id="ln-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!valid || create.isPending}>
              {t('hr.leaves.submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoanDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: loan, isLoading } = useLoan(id);
  const act = useLoanAction();
  const canApprove = useHasPermission(HR.loansApprove);
  const canManage = useHasPermission(HR.loansManage);
  const [note, setNote] = useState('');
  const [money, setMoney] = useState<{ mode: 'disburse' | 'repay'; treasuryId: string | null; date: string; amount: string } | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (id !== openedFor) {
    setOpenedFor(id);
    setNote('');
    setMoney(null);
  }

  async function run(action: LoanAction, confirmText?: string) {
    if (!loan) return;
    if (confirmText && !(await confirmDialog(confirmText))) return;
    try {
      await act.mutateAsync({ id: loan.id, ...action });
      toast.success(t('hr.saved'));
      setMoney(null);
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const nextOpen = loan?.installments.find((i) => i.status !== 'paid');

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {isLoading || !loan ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {loan.number} — {loan.employeeName}
                <Badge variant={STATUS_VARIANT[loan.status]}>{t(`hr.loans.statuses.${loan.status}`)}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <Stat label={t('hr.loans.amount')} value={formatMoney(loan.amountMinorUnits, loan.currency)} />
                <Stat label={t('hr.loans.remaining')} value={formatMoney(loan.remainingMinorUnits, loan.currency)} />
                <Stat label={t('hr.loans.paidOut')} value={loan.disbursedOn ? `${loan.disbursedOn} — ${loan.treasuryName}` : '—'} />
              </div>
              {loan.reason ? <p className="text-muted-foreground">{loan.reason}</p> : null}
              {loan.decisionNote ? (
                <p className="text-muted-foreground">
                  {loan.decidedByName}: {loan.decisionNote}
                </p>
              ) : null}

              <div className="max-h-56 overflow-y-auto rounded-lg border">
                <table className="w-full">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-start">#</th>
                      <th className="px-3 py-1.5 text-start">{t('hr.loans.month')}</th>
                      <th className="px-3 py-1.5 text-start">{t('hr.loans.installment')}</th>
                      <th className="px-3 py-1.5 text-start">{t('hr.loans.paid')}</th>
                      <th className="px-3 py-1.5 text-start">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.installments.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-1.5 tabular-nums">{i.sequence}</td>
                        <td className="px-3 py-1.5 tabular-nums">{i.month}</td>
                        <td className="px-3 py-1.5 tabular-nums">{formatAmount(i.amountMinorUnits)}</td>
                        <td className="px-3 py-1.5 tabular-nums">{formatAmount(i.paidMinorUnits)}</td>
                        <td className="px-3 py-1.5">{t(`hr.loans.installmentStatuses.${i.status}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {loan.repayments.length ? (
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {loan.repayments.map((r) => (
                    <li key={r.id}>
                      {r.number} — {r.date} — {r.treasuryName} — {formatAmount(r.amountMinorUnits)}
                    </li>
                  ))}
                </ul>
              ) : null}

              {money ? (
                <div className="grid gap-3 rounded-lg border p-3">
                  <p className="font-medium">{t(money.mode === 'disburse' ? 'hr.loans.disburseTitle' : 'hr.loans.repayTitle')}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <TreasurySelect value={money.treasuryId} onChange={(v) => setMoney({ ...money, treasuryId: v })} currency={loan.currency} paymentMethod="cash" />
                    <Input type="date" value={money.date} onChange={(e) => setMoney({ ...money, date: e.target.value })} />
                    {money.mode === 'repay' ? (
                      <Input dir="ltr" inputMode="decimal" value={money.amount} onChange={(e) => setMoney({ ...money, amount: e.target.value })} />
                    ) : null}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setMoney(null)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      disabled={act.isPending || !money.treasuryId || !money.date || (money.mode === 'repay' && !toMinor(money.amount))}
                      onClick={() =>
                        run(
                          money.mode === 'disburse'
                            ? { action: 'disburse', input: { treasuryId: money.treasuryId!, date: money.date } }
                            : { action: 'repay', input: { treasuryId: money.treasuryId!, date: money.date, amountMinorUnits: toMinor(money.amount)! } },
                        )
                      }
                    >
                      {t('common.save')}
                    </Button>
                  </div>
                </div>
              ) : null}

              {loan.status === 'pending' || loan.status === 'approved' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="ln-note">{t('hr.leaves.decisionNote')}</Label>
                  <Textarea id="ln-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {(loan.status === 'pending' || loan.status === 'approved') && (canManage || canApprove) ? (
                  <Button variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => run({ action: 'cancel', input: { note: note || null } }, t('hr.loans.cancelConfirm'))}>
                    {t('hr.loans.cancel')}
                  </Button>
                ) : null}
                {loan.status === 'pending' && canApprove ? (
                  <>
                    <Button variant="outline" disabled={act.isPending} onClick={() => run({ action: 'reject', input: { note: note || null } })}>
                      {t('hr.leaves.reject')}
                    </Button>
                    <Button disabled={act.isPending} onClick={() => run({ action: 'approve', input: { note: note || null } })}>
                      {t('hr.leaves.approve')}
                    </Button>
                  </>
                ) : null}
                {loan.status === 'approved' && canManage && !money ? (
                  <Button onClick={() => setMoney({ mode: 'disburse', treasuryId: null, date: today(), amount: '' })}>{t('hr.loans.disburse')}</Button>
                ) : null}
                {loan.status !== 'closed' && loan.status !== 'rejected' && loan.status !== 'cancelled' && nextOpen && canManage ? (
                  <Button
                    variant="outline"
                    disabled={act.isPending}
                    onClick={() => run({ action: 'postpone', input: { month: nextOpen.month } }, t('hr.loans.postponeConfirm', { month: nextOpen.month }))}
                  >
                    {t('hr.loans.postpone')}
                  </Button>
                ) : null}
                {loan.status === 'active' && canManage && !money ? (
                  <Button
                    variant="outline"
                    onClick={() => setMoney({ mode: 'repay', treasuryId: null, date: today(), amount: minorUnitsToDecimalString(loan.remainingMinorUnits) })}
                  >
                    {t('hr.loans.repay')}
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ── bonuses and penalties ────────────────────────────────────────────────

/** المكافآت والجزاءات — per pay month, for one employee or a whole department at once. */
export function PayAdjustmentsPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth);
  const { data, isLoading } = usePayAdjustments({ month });
  const remove = useDeletePayAdjustment();
  const [creating, setCreating] = useState(false);

  async function onDelete(a: PayAdjustmentDto) {
    if (!(await confirmDialog(t('hr.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(a.id);
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const columns: ColumnDef<PayAdjustmentDto>[] = [
      {
        id: 'employee',
        header: t('hr.attendance.employee'),
        accessorFn: (r) => `${r.employeeName} ${r.employeeCode}`,
        cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span>,
      },
      {
        id: 'kind',
        header: t('hr.adjustments.kind'),
        cell: ({ row }) => <Badge variant={row.original.kind === 'bonus' ? 'success' : 'danger'}>{t(`hr.adjustments.kinds.${row.original.kind}`)}</Badge>,
      },
      {
        id: 'value',
        header: t('hr.adjustments.value'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.amountMinorUnits ? formatAmount(row.original.amountMinorUnits) : t('hr.adjustments.daysValue', { days: row.original.days })}
          </span>
        ),
      },
      { accessorKey: 'reason', header: t('hr.leaves.reason') },
      { id: 'by', header: t('hr.adjustments.by'), accessorFn: (r) => r.createdByName ?? '—' },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.settled ? (
            <Badge variant="neutral">{t('hr.adjustments.settled')}</Badge>
          ) : (
            <Can permission={HR.salariesManage}>
              <Button variant="ghost" size="sm" className="text-destructive" aria-label={t('common.delete')} onClick={() => onDelete(row.original)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Can>
          ),
      },
    ];

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.adjustments.title')}
        description={t('hr.adjustments.subtitle')}
        actions={
          <Can permission={HR.salariesManage}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.adjustments.add')}
            </Button>
          </Can>
        }
      />
      <div className="grid w-44 gap-1.5">
        <Label htmlFor="adj-month">{t('hr.adjustments.month')}</Label>
        <Input id="adj-month" type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} />
      </div>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable searchPlaceholder={t('hr.employees.search')} />
      <NewAdjustmentDialog open={creating} month={month} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewAdjustmentDialog({ open, month, onClose }: { open: boolean; month: string; onClose: () => void }) {
  const { t } = useTranslation();
  const currency = useBaseCurrency();
  const create = useCreatePayAdjustments();
  const { data: employees } = useEmployees({ status: 'active' });
  const { data: departments } = useDepartments();
  const blank = { kind: 'bonus' as PayAdjustmentKindDto, target: 'employee' as 'employee' | 'department' | 'all', employeeId: '', departmentId: '', by: 'amount' as 'amount' | 'days', value: '', reason: '', month };
  const [form, setForm] = useState(blank);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ ...blank, month });
  }
  const targets = (employees ?? []).filter((e) =>
    form.target === 'all' ? true : form.target === 'department' ? e.departmentId === form.departmentId : e.id === form.employeeId,
  );
  const days = Number(form.value);
  const amount = form.by === 'amount' ? toMinor(form.value) : null;
  const valueOk = form.by === 'amount' ? Boolean(amount) : Number.isFinite(days) && days >= 0.25 && days <= 60 && Math.round(days * 4) === days * 4;
  const valid = targets.length > 0 && valueOk && form.reason.trim() && /^\d{4}-\d{2}$/.test(form.month);

  async function submit() {
    if (!valid) return;
    try {
      const result = await create.mutateAsync({
        employeeIds: targets.map((e) => e.id),
        kind: form.kind,
        month: form.month,
        amountMinorUnits: form.by === 'amount' ? amount : null,
        days: form.by === 'days' ? days : null,
        reason: form.reason,
      });
      toast.success(t('hr.adjustments.created', { count: result.created }));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('hr.adjustments.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('hr.adjustments.kind')}</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as PayAdjustmentKindDto })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">{t('hr.adjustments.kinds.bonus')}</SelectItem>
                  <SelectItem value="penalty">{t('hr.adjustments.kinds.penalty')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-new-month">{t('hr.adjustments.month')}</Label>
              <Input id="adj-new-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('hr.adjustments.for')}</Label>
            <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v as typeof form.target })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">{t('hr.adjustments.targets.employee')}</SelectItem>
                <SelectItem value="department">{t('hr.adjustments.targets.department')}</SelectItem>
                <SelectItem value="all">{t('hr.adjustments.targets.all')}</SelectItem>
              </SelectContent>
            </Select>
            {form.target === 'employee' ? (
              <Select value={form.employeeId || NONE} onValueChange={(v) => setForm({ ...form, employeeId: v === NONE ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('hr.leaves.pickEmployee')} />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName} ({e.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : form.target === 'department' ? (
              <Select value={form.departmentId || NONE} onValueChange={(v) => setForm({ ...form, departmentId: v === NONE ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('hr.employees.department')} />
                </SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {form.target !== 'employee' ? <p className="text-xs text-muted-foreground">{t('hr.adjustments.targetCount', { count: targets.length })}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('hr.adjustments.by')}</Label>
              <Select value={form.by} onValueChange={(v) => setForm({ ...form, by: v as 'amount' | 'days', value: '' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">{t('hr.adjustments.byAmount', { currency })}</SelectItem>
                  <SelectItem value="days">{t('hr.adjustments.byDays')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-value">{t('hr.adjustments.value')}</Label>
              <Input id="adj-value" dir="ltr" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          {form.by === 'days' ? <p className="text-xs text-muted-foreground">{t('hr.adjustments.daysHint')}</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="adj-reason">{t('hr.leaves.reason')}</Label>
            <Input id="adj-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!valid || create.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

