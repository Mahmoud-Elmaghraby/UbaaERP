import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PayrollLineDto, PayrollRunDto, PayrollRunStatusDto, PayrollRunSummaryDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { CheckCircle2, Download, FileQuestion, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { decimalToMinorUnits, formatAmount, formatMoney, minorUnitsToDecimalString } from '../../../lib/money';
import { downloadXlsx } from '../../../lib/xlsx';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { TreasurySelect } from '../../../components/document/treasury-select';
import { PrintButton, openPrint } from '../../../components/printing/print-button';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../components/document/document-layout';
import { useBranches } from '../../settings/queries';
import { useCreatePayrollRun, useDeletePayrollRun, useDepartments, usePayrollAction, usePayrollRun, usePayrollRuns } from '../api/queries';

const ALL = '__all__';
const PATH = '/hr/payroll';
const STATUS_VARIANT: Record<PayrollRunStatusDto, 'warning' | 'info' | 'success'> = { draft: 'warning', posted: 'info', paid: 'success' };

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function amount(minor: string) {
  return <span className="tabular-nums">{formatAmount(minor)}</span>;
}

/** Sum of the line's pay deductions (everything but the loan and the hand adjustment). */
function deductionsOf(l: PayrollLineDto): string {
  return [l.componentDeductionsMinorUnits, l.absenceMinorUnits, l.lateMinorUnits, l.unpaidLeaveMinorUnits, l.penaltiesMinorUnits]
    .reduce((s, x) => s + BigInt(x), 0n)
    .toString();
}

// ── list ──────────────────────────────────────────────────────────────────

/** مسيرات الرواتب. */
export function PayrollRunsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading } = usePayrollRuns({ year });
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<PayrollRunSummaryDto>[]>(
    () => [
      { accessorKey: 'number', header: t('hr.payroll.number'), cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.number}</span> },
      { accessorKey: 'month', header: t('hr.payroll.month'), cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.month}</span> },
      { id: 'scope', header: t('hr.payroll.scope'), accessorFn: (r) => r.departmentName ?? r.branchName ?? t('hr.payroll.everyone') },
      { accessorKey: 'employeeCount', header: t('hr.employeeCount') },
      { id: 'gross', header: t('hr.payroll.gross'), cell: ({ row }) => amount(row.original.grossMinorUnits) },
      { id: 'net', header: t('hr.salary.net'), cell: ({ row }) => <span className="font-semibold">{amount(row.original.netMinorUnits)}</span> },
      { id: 'paid', header: t('hr.payroll.paidAmount'), cell: ({ row }) => amount(row.original.paidMinorUnits) },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{t(`hr.payroll.statuses.${row.original.status}`)}</Badge>,
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.payroll.title')}
        description={t('hr.payroll.subtitle')}
        actions={
          <Can permission={HR.payrollManage}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.payroll.add')}
            </Button>
          </Can>
        }
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
          {year - 1}
        </Button>
        <span className="px-2 font-semibold tabular-nums">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
          {year + 1}
        </Button>
      </div>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} onRowClick={(r) => navigate(`${PATH}/${r.id}`)} />
      <NewRunDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewRunDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreatePayrollRun();
  const canListBranches = useHasPermission('settings.manage');
  const { data: branches } = useBranches();
  const { data: departments } = useDepartments();
  const lastMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const [form, setForm] = useState({ month: lastMonth, scope: 'all' as 'all' | 'branch' | 'department', branchId: '', departmentId: '' });
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ month: lastMonth, scope: 'all', branchId: '', departmentId: '' });
  }
  const valid =
    /^\d{4}-\d{2}$/.test(form.month) && (form.scope === 'all' || (form.scope === 'branch' ? form.branchId : form.departmentId));

  async function submit() {
    if (!valid) return;
    try {
      const run = await create.mutateAsync({
        month: form.month,
        branchId: form.scope === 'branch' ? form.branchId : null,
        departmentId: form.scope === 'department' ? form.departmentId : null,
      });
      onClose();
      navigate(`${PATH}/${run.id}`);
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('hr.payroll.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pr-month">{t('hr.payroll.month')}</Label>
            <Input id="pr-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('hr.payroll.scope')}</Label>
            <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as typeof form.scope })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('hr.payroll.everyone')}</SelectItem>
                <SelectItem value="department">{t('hr.payroll.oneDepartment')}</SelectItem>
                {canListBranches ? <SelectItem value="branch">{t('hr.payroll.oneBranch')}</SelectItem> : null}
              </SelectContent>
            </Select>
            {form.scope === 'department' ? (
              <Select value={form.departmentId || ALL} onValueChange={(v) => setForm({ ...form, departmentId: v === ALL ? '' : v })}>
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
            {form.scope === 'branch' ? (
              <Select value={form.branchId || ALL} onValueChange={(v) => setForm({ ...form, branchId: v === ALL ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('hr.employees.branch')} />
                </SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('hr.payroll.createHint')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!valid || create.isPending}>
              {t('hr.payroll.calculate')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── one run ───────────────────────────────────────────────────────────────

/** /hr/payroll/:id — review, adjust, post, pay. */
export function PayrollRunPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isLoading, isError } = usePayrollRun(id);
  const act = usePayrollAction(id ?? '');
  const remove = useDeletePayrollRun();
  const [lineId, setLineId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !run) return <EmptyState icon={<FileQuestion />} title={t('hr.payroll.notFound')} />;
  const line = run.lines.find((l) => l.id === lineId) ?? null;
  const draft = run.status === 'draft';

  async function run_(a: Parameters<typeof act.mutateAsync>[0], confirmText?: string) {
    if (confirmText && !(await confirmDialog(confirmText))) return;
    try {
      await act.mutateAsync(a);
      toast.success(t('hr.saved'));
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  async function onDelete() {
    if (!run || !(await confirmDialog(t('hr.payroll.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(run.id);
      navigate(PATH, { replace: true });
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  function exportRun() {
    if (!run) return;
    const n = (minor: string) => Number(minorUnitsToDecimalString(minor));
    downloadXlsx(
      `${run.number}-${run.month}`,
      [
        t('hr.employees.code'),
        t('hr.employees.fullName'),
        t('hr.employees.department'),
        t('hr.salary.basic'),
        t('hr.salary.earnings'),
        t('hr.attendance.overtime'),
        t('hr.adjustments.kinds.bonus'),
        t('hr.payroll.gross'),
        t('hr.salary.deductions'),
        t('hr.payroll.absence'),
        t('hr.payroll.lateEarly'),
        t('hr.payroll.unpaidLeave'),
        t('hr.adjustments.kinds.penalty'),
        t('hr.payroll.loan'),
        t('hr.payroll.adjustment'),
        t('hr.salary.net'),
      ],
      run.lines.map((l) => [
        l.employeeCode,
        l.employeeName,
        l.departmentName ?? '',
        n(l.basicMinorUnits),
        n(l.allowancesMinorUnits),
        n(l.overtimeMinorUnits),
        n(l.bonusesMinorUnits),
        n(l.grossMinorUnits),
        n(l.componentDeductionsMinorUnits),
        n(l.absenceMinorUnits),
        n(l.lateMinorUnits),
        n(l.unpaidLeaveMinorUnits),
        n(l.penaltiesMinorUnits),
        n(l.loanMinorUnits),
        n(l.manualAdjustmentMinorUnits),
        n(l.netMinorUnits),
      ]),
    );
  }

  function exportBankSheet() {
    if (!run) return;
    const rows = run.lines
      .filter((l) => l.paymentMethod !== 'cash' && BigInt(l.netMinorUnits) > 0n)
      .map((l) => [l.employeeCode, l.employeeName, t(`hr.employees.paymentMethods.${l.paymentMethod}`), l.bankName ?? '', l.bankAccount ?? '', Number(minorUnitsToDecimalString(l.netMinorUnits))]);
    downloadXlsx(`${run.number}-${run.month}-bank`, [t('hr.employees.code'), t('hr.employees.fullName'), t('hr.employees.paymentMethod'), t('hr.employees.bankName'), t('hr.employees.bankAccount'), t('hr.salary.net')], rows);
  }

  const columns: ColumnDef<PayrollLineDto>[] = [
    {
      id: 'employee',
      header: t('hr.attendance.employee'),
      accessorFn: (r) => `${r.employeeName} ${r.employeeCode}`,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.employeeName}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.employeeCode}
            {row.original.warnings.length ? <span className="ms-1 text-warning">● {row.original.warnings.map((w) => t(`hr.payroll.warnings.${w}`)).join('، ')}</span> : null}
          </span>
        </span>
      ),
    },
    { id: 'basic', header: t('hr.salary.basic'), cell: ({ row }) => amount((BigInt(row.original.basicMinorUnits) + BigInt(row.original.allowancesMinorUnits)).toString()) },
    { id: 'overtime', header: t('hr.attendance.overtime'), cell: ({ row }) => amount(row.original.overtimeMinorUnits) },
    { id: 'bonuses', header: t('hr.adjustments.kinds.bonus'), cell: ({ row }) => amount(row.original.bonusesMinorUnits) },
    { id: 'gross', header: t('hr.payroll.gross'), cell: ({ row }) => amount(row.original.grossMinorUnits) },
    { id: 'deductions', header: t('hr.salary.deductions'), cell: ({ row }) => <span className="text-destructive">{amount(deductionsOf(row.original))}</span> },
    { id: 'loan', header: t('hr.payroll.loan'), cell: ({ row }) => amount(row.original.loanMinorUnits) },
    {
      id: 'adjust',
      header: t('hr.payroll.adjustment'),
      cell: ({ row }) => (row.original.manualAdjustmentMinorUnits === '0' ? <span className="text-muted-foreground">—</span> : amount(row.original.manualAdjustmentMinorUnits)),
    },
    { id: 'net', header: t('hr.salary.net'), cell: ({ row }) => <span className="font-semibold">{amount(row.original.netMinorUnits)}</span> },
    {
      id: 'paid',
      header: t('hr.payroll.paidAmount'),
      cell: ({ row }) => (row.original.paid ? <CheckCircle2 className="h-4 w-4 text-success" aria-label={row.original.paidOn ?? ''} /> : null),
    },
  ];

  const totals = run.totals;
  return (
    <>
      <DocumentHeaderBar
        backTo={PATH}
        backLabel={t('documents.back')}
        eyebrow={t('hr.payroll.title')}
        title={`${run.number} — ${run.month}${run.departmentName ? ` — ${run.departmentName}` : run.branchName ? ` — ${run.branchName}` : ''}`}
        status={<Badge variant={STATUS_VARIANT[run.status]}>{t(`hr.payroll.statuses.${run.status}`)}</Badge>}
        actions={
          <>
            <PrintButton documentType="payroll_run" id={run.id} />
            <Button variant="outline" onClick={exportRun}>
              <Download className="me-1 h-4 w-4" />
              {t('hr.payroll.excel')}
            </Button>
            <Button variant="outline" onClick={exportBankSheet}>
              <Download className="me-1 h-4 w-4" />
              {t('hr.payroll.bankSheet')}
            </Button>
            {draft ? (
              <Can permission={HR.payrollManage}>
                <Button variant="ghost" className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" disabled={act.isPending} onClick={() => run_({ action: 'recalculate' })}>
                  <RefreshCw className="me-1 h-4 w-4" />
                  {t('hr.payroll.recalculate')}
                </Button>
              </Can>
            ) : null}
            {draft ? (
              <Can permission={HR.payrollApprove}>
                <Button disabled={act.isPending} onClick={() => run_({ action: 'post' }, t('hr.payroll.postConfirm', { month: run.month }))}>
                  {t('hr.payroll.post')}
                </Button>
              </Can>
            ) : null}
            {run.status === 'posted' ? (
              <Can permission={HR.payrollPay}>
                <Button onClick={() => setPaying(true)}>
                  <Wallet className="me-1 h-4 w-4" />
                  {t('hr.payroll.pay')}
                </Button>
              </Can>
            ) : null}
          </>
        }
      />
      <DocumentBody
        main={
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {(
                [
                  ['gross', totals.gross],
                  ['deductions', (BigInt(totals.gross) - BigInt(totals.net) - BigInt(totals.loan)).toString()],
                  ['loan', totals.loan],
                  ['net', totals.net],
                ] as const
              ).map(([key, minor]) => (
                <div key={key} className="rounded-xl border bg-card p-4 shadow-card">
                  <p className="text-xs text-muted-foreground">{t(`hr.payroll.totals.${key}`)}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(minor, run.currency)}</p>
                </div>
              ))}
            </div>
            {run.skippedEmployees.length ? (
              <p className="text-sm text-muted-foreground">{t('hr.payroll.skipped', { names: run.skippedEmployees.join('، ') })}</p>
            ) : null}
            <SectionCard flush>
              <DataTable columns={columns} data={run.lines} searchable searchPlaceholder={t('hr.employees.search')} onRowClick={(l) => setLineId(l.id)} />
            </SectionCard>
            {run.payments.length ? (
              <SectionCard title={t('hr.payroll.payments')}>
                <ul className="grid gap-1 text-sm">
                  {run.payments.map((p) => (
                    <li key={p.id} className="tabular-nums">
                      {p.number} — {p.date} — {p.treasuryName} — {formatMoney(p.amountMinorUnits, run.currency)} ({t('hr.payroll.employeesCount', { count: p.lineCount })})
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </>
        }
      />
      <LineDialog run={run} line={line} onClose={() => setLineId(null)} />
      <PayDialog run={run} open={paying} onClose={() => setPaying(false)} />
    </>
  );
}

function LineDialog({ run, line, onClose }: { run: PayrollRunDto; line: PayrollLineDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const act = usePayrollAction(run.id);
  const canEdit = useHasPermission(HR.payrollManage) && run.status === 'draft';
  const [form, setForm] = useState({ absence: '', late: '', overtime: '', adjustment: '', note: '' });
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if ((line?.id ?? null) !== openedFor) {
    setOpenedFor(line?.id ?? null);
    if (line) {
      setForm({
        absence: minorUnitsToDecimalString(line.absenceMinorUnits),
        late: minorUnitsToDecimalString(line.lateMinorUnits),
        overtime: minorUnitsToDecimalString(line.overtimeMinorUnits),
        adjustment: minorUnitsToDecimalString(line.manualAdjustmentMinorUnits),
        note: line.manualAdjustmentNote ?? '',
      });
    }
  }
  if (!line) return null;
  const d = line.details as {
    employedDays?: number;
    monthDays?: number;
    dayRateMinorUnits?: string;
    hourRateMinorUnits?: string;
    absentDays?: number;
    lateMinutes?: number;
    chargeableLateMinutes?: number;
    overtimeMinutes?: number;
    components?: { name: string; kind: string; percent: number | null; valueMinorUnits: string }[];
    leaves?: { type: string; days: number; payPercent: number }[];
    adjustments?: { kind: string; reason: string; amountMinorUnits: string | null; days: number | null }[];
  };
  const toMinor = (v: string, signed = false) => {
    try {
      const m = decimalToMinorUnits(v || '0');
      return signed || BigInt(m) >= 0n ? m : null;
    } catch {
      return null;
    }
  };

  async function save() {
    if (!line) return;
    const absence = toMinor(form.absence);
    const late = toMinor(form.late);
    const overtime = toMinor(form.overtime);
    const adjustment = toMinor(form.adjustment, true);
    if (absence === null || late === null || overtime === null || adjustment === null) return;
    try {
      await act.mutateAsync({
        action: 'updateLine',
        lineId: line.id,
        input: {
          ...(absence !== line.absenceMinorUnits ? { absenceMinorUnits: absence } : {}),
          ...(late !== line.lateMinorUnits ? { lateMinorUnits: late } : {}),
          ...(overtime !== line.overtimeMinorUnits ? { overtimeMinorUnits: overtime } : {}),
          manualAdjustmentMinorUnits: adjustment,
          manualAdjustmentNote: form.note.trim() || null,
        },
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  async function reset(field: 'absence' | 'late' | 'overtime') {
    if (!line) return;
    try {
      await act.mutateAsync({ action: 'updateLine', lineId: line.id, input: { [`${field}MinorUnits`]: null } });
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  async function removeLine() {
    if (!line || !(await confirmDialog(t('hr.payroll.removeLineConfirm', { name: line.employeeName }), { tone: 'danger' }))) return;
    try {
      await act.mutateAsync({ action: 'removeLine', lineId: line.id });
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const row = (label: string, value: string, tone?: 'minus' | 'total') => (
    <div className={`flex justify-between gap-4 py-0.5 ${tone === 'total' ? 'border-t pt-1.5 font-semibold' : ''}`}>
      <span className={tone === 'minus' ? 'text-destructive' : undefined}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  const editable = (field: 'absence' | 'late' | 'overtime', label: string, hint: string) => (
    <div className="grid gap-1">
      <Label htmlFor={`pl-${field}`} className="flex items-center gap-2">
        {label}
        {line.overridden.includes(field) ? <Badge variant="outline">{t('hr.payroll.overridden')}</Badge> : null}
      </Label>
      <div className="flex gap-2">
        <Input id={`pl-${field}`} dir="ltr" inputMode="decimal" disabled={!canEdit} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
        {canEdit && line.overridden.includes(field) ? (
          <Button variant="ghost" size="sm" onClick={() => reset(field)}>
            {t('hr.payroll.backToSuggestion')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {line.employeeName} — {run.month}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <div className="grid content-start">
            {row(t('hr.salary.basic'), formatAmount(line.basicMinorUnits))}
            {(d.components ?? []).map((c, i) => (
              <div key={i}>{row(`${c.name}${c.percent !== null ? ` (${c.percent}%)` : ''}`, `${c.kind === 'deduction' ? '− ' : '+ '}${formatAmount(c.valueMinorUnits)}`, c.kind === 'deduction' ? 'minus' : undefined)}</div>
            ))}
            {row(t('hr.attendance.overtime'), `+ ${formatAmount(line.overtimeMinorUnits)}`)}
            {row(t('hr.adjustments.kinds.bonus'), `+ ${formatAmount(line.bonusesMinorUnits)}`)}
            {row(t('hr.payroll.absence'), `− ${formatAmount(line.absenceMinorUnits)}`, 'minus')}
            {row(t('hr.payroll.lateEarly'), `− ${formatAmount(line.lateMinorUnits)}`, 'minus')}
            {row(t('hr.payroll.unpaidLeave'), `− ${formatAmount(line.unpaidLeaveMinorUnits)}`, 'minus')}
            {row(t('hr.adjustments.kinds.penalty'), `− ${formatAmount(line.penaltiesMinorUnits)}`, 'minus')}
            {row(t('hr.payroll.loan'), `− ${formatAmount(line.loanMinorUnits)}`, 'minus')}
            {line.manualAdjustmentMinorUnits !== '0' ? row(t('hr.payroll.adjustment'), formatAmount(line.manualAdjustmentMinorUnits)) : null}
            {row(`${t('hr.salary.net')} (${run.currency})`, formatAmount(line.netMinorUnits), 'total')}
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
              <span>{t('hr.payroll.rates', { day: formatAmount(d.dayRateMinorUnits ?? '0'), hour: formatAmount(d.hourRateMinorUnits ?? '0') })}</span>
              {d.employedDays !== d.monthDays ? <span>{t('hr.payroll.partial', { days: d.employedDays, of: d.monthDays })}</span> : null}
              {(d.leaves ?? []).map((l, i) => (
                <span key={i}>{t('hr.payroll.leaveLine', { type: l.type, days: l.days, pay: l.payPercent })}</span>
              ))}
              {(d.adjustments ?? []).map((a, i) => (
                <span key={i}>
                  {t(`hr.adjustments.kinds.${a.kind}`)}: {a.reason} — {a.amountMinorUnits ? formatAmount(a.amountMinorUnits) : t('hr.adjustments.daysValue', { days: a.days })}
                </span>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-3">
            {editable('absence', t('hr.payroll.absence'), t('hr.payroll.absenceHint', { days: d.absentDays ?? 0 }))}
            {editable('late', t('hr.payroll.lateEarly'), t('hr.payroll.lateHint', { minutes: d.lateMinutes ?? 0, chargeable: d.chargeableLateMinutes ?? 0 }))}
            {editable('overtime', t('hr.attendance.overtime'), t('hr.payroll.overtimeHint', { minutes: d.overtimeMinutes ?? 0 }))}
            <div className="grid gap-1">
              <Label htmlFor="pl-adjust">{t('hr.payroll.adjustment')}</Label>
              <Input id="pl-adjust" dir="ltr" inputMode="decimal" disabled={!canEdit} value={form.adjustment} onChange={(e) => setForm({ ...form, adjustment: e.target.value })} />
              <Input placeholder={t('hr.payroll.adjustmentNote')} disabled={!canEdit} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t('hr.payroll.adjustmentHint')}</p>
            </div>
            <Button variant="outline" onClick={() => openPrint('payslip', line.id)}>
              {t('hr.payroll.printPayslip')}
            </Button>
            {canEdit ? (
              <div className="flex justify-between gap-2">
                <Button variant="ghost" className="text-destructive" onClick={removeLine}>
                  {t('hr.payroll.removeLine')}
                </Button>
                <Button onClick={save} disabled={act.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ run, open, onClose }: { run: PayrollRunDto; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const act = usePayrollAction(run.id);
  const [method, setMethod] = useState<'all' | 'cash' | 'bank' | 'wallet'>('all');
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const unpaid = run.lines.filter((l) => !l.paid && (method === 'all' || l.paymentMethod === method));
  const total = unpaid.reduce((s, l) => s + BigInt(l.netMinorUnits), 0n).toString();

  async function submit() {
    if (!treasuryId || unpaid.length === 0) return;
    try {
      await act.mutateAsync({ action: 'pay', input: { treasuryId, date, lineIds: method === 'all' ? undefined : unpaid.map((l) => l.id) } });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('hr.payroll.pay')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('hr.payroll.payWho')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('hr.payroll.everyoneUnpaid')}</SelectItem>
                {(['cash', 'bank', 'wallet'] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`hr.employees.paymentMethods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TreasurySelect value={treasuryId} onChange={setTreasuryId} currency={run.currency} paymentMethod={method === 'cash' || method === 'all' ? 'cash' : 'bank_transfer'} label={t('hr.payroll.fromTreasury')} />
          <div className="grid gap-1.5">
            <Label htmlFor="pay-date">{t('hr.payroll.payDate')}</Label>
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {t('hr.payroll.payPreview', { count: unpaid.length, amount: formatMoney(total, run.currency) })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!treasuryId || unpaid.length === 0 || act.isPending}>
              {t('hr.payroll.pay')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
