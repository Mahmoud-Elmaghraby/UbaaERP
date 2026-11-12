import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { CreateLeaveRequestDto, LeaveBalanceDto, LeaveRequestDto, LeaveRequestStatusDto, LeaveTypeDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
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
  Textarea,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import {
  useCarryOverLeave,
  useCreateLeaveRequest,
  useDecideLeaveRequest,
  useDeleteLeaveType,
  useEmployees,
  useLeaveBalances,
  useLeavePreview,
  useLeaveRequests,
  useLeaveTypes,
  useSaveLeaveBalance,
  useSaveLeaveType,
} from '../api/queries';

const ALL = '__all__';
const NONE = '__none__';
const STATUS_VARIANT: Record<LeaveRequestStatusDto, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** "3" or "2.5" — leave days are whole or half. */
function daysText(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── requests ──────────────────────────────────────────────────────────────

/** طلبات الإجازة — record, approve, reject, cancel. */
export function LeaveRequestsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LeaveRequestStatusDto | ''>('pending');
  const { data, isLoading } = useLeaveRequests({ status: status || undefined });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<LeaveRequestDto | null>(null);

  const columns = useMemo<ColumnDef<LeaveRequestDto>[]>(
    () => [
      { accessorKey: 'number', header: t('hr.leaves.number'), cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.number}</span> },
      {
        id: 'employee',
        header: t('hr.attendance.employee'),
        accessorFn: (r) => `${r.employeeName} ${r.employeeCode}`,
        cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span>,
      },
      { accessorKey: 'leaveTypeName', header: t('hr.leaves.type') },
      {
        id: 'period',
        header: t('hr.leaves.period'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.startDate}
            {row.original.endDate !== row.original.startDate ? ` → ${row.original.endDate}` : ''}
          </span>
        ),
      },
      { id: 'days', header: t('hr.leaves.days'), cell: ({ row }) => <span className="tabular-nums">{daysText(row.original.days)}</span> },
      { id: 'manager', header: t('hr.employees.manager'), accessorFn: (r) => r.managerName ?? '—' },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{t(`hr.leaves.statuses.${row.original.status}`)}</Badge>,
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.leaves.title')}
        description={t('hr.leaves.subtitle')}
        actions={
          <Can permission={HR.leavesManage}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.leaves.add')}
            </Button>
          </Can>
        }
      />
      <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : (v as LeaveRequestStatusDto))}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('hr.employees.allStatuses')}</SelectItem>
          {(['pending', 'approved', 'rejected', 'cancelled'] as const).map((s) => (
            <SelectItem key={s} value={s}>
              {t(`hr.leaves.statuses.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable searchPlaceholder={t('hr.employees.search')} onRowClick={(r) => setOpen(r)} />
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} />
      <RequestDialog request={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateLeaveRequest();
  const { data: employees } = useEmployees({ status: 'active' });
  const { data: types } = useLeaveTypes();
  const blank = { employeeId: '', leaveTypeId: '', startDate: '', endDate: '', halfDay: false, reason: '' };
  const [form, setForm] = useState(blank);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(blank);
  }
  const ready = Boolean(form.employeeId && form.leaveTypeId && form.startDate && form.endDate && form.endDate >= form.startDate);
  const input: CreateLeaveRequestDto | null = ready
    ? {
        employeeId: form.employeeId,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        halfDay: form.halfDay && form.startDate === form.endDate,
        reason: form.reason.trim() || null,
      }
    : null;
  const preview = useLeavePreview(open ? input && { ...input, reason: null } : null);

  async function submit() {
    if (!input) return;
    try {
      await create.mutateAsync(input);
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
          <DialogTitle>{t('hr.leaves.add')}</DialogTitle>
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
          <div className="grid gap-1.5">
            <Label>{t('hr.leaves.type')}</Label>
            <Select value={form.leaveTypeId || NONE} onValueChange={(v) => setForm({ ...form, leaveTypeId: v === NONE ? '' : v })}>
              <SelectTrigger>
                <SelectValue placeholder={t('hr.leaves.pickType')} />
              </SelectTrigger>
              <SelectContent>
                {(types ?? [])
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lv-from">{t('hr.attendance.from')}</Label>
              <Input
                id="lv-from"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate && form.endDate >= e.target.value ? form.endDate : e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lv-to">{t('hr.attendance.to')}</Label>
              <Input id="lv-to" type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          {form.startDate && form.startDate === form.endDate ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.halfDay} onCheckedChange={(v) => setForm({ ...form, halfDay: v === true })} />
              {t('hr.leaves.halfDay')}
            </label>
          ) : null}
          {input ? (
            <p className={`rounded-lg px-3 py-2 text-sm ${preview.isError ? 'bg-danger-soft text-danger' : 'bg-muted'}`}>
              {preview.isError
                ? errorText(preview.error, t('common.error'))
                : preview.data
                  ? preview.data.available === null
                    ? t('hr.leaves.previewNoBalance', { days: daysText(preview.data.days) })
                    : t('hr.leaves.preview', { days: daysText(preview.data.days), available: daysText(preview.data.available) })
                  : '…'}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="lv-reason">{t('hr.leaves.reason')}</Label>
            <Textarea id="lv-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!input || create.isPending || preview.isError}>
              {t('hr.leaves.submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({ request, onClose }: { request: LeaveRequestDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const decide = useDecideLeaveRequest();
  const canApprove = useHasPermission(HR.leavesApprove);
  const canManage = useHasPermission(HR.leavesManage);
  const [note, setNote] = useState('');
  const [openedFor, setOpenedFor] = useState<LeaveRequestDto | null>(null);
  if (request !== openedFor) {
    setOpenedFor(request);
    setNote('');
  }
  if (!request) return null;

  async function act(action: 'approve' | 'reject' | 'cancel') {
    if (!request) return;
    if (action === 'cancel' && !(await confirmDialog(t('hr.leaves.cancelConfirm'), { tone: 'danger' }))) return;
    try {
      await decide.mutateAsync({ id: request.id, action, input: { note: note.trim() || null } });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const rows: [string, string][] = [
    [t('hr.attendance.employee'), `${request.employeeName} (${request.employeeCode})`],
    [t('hr.employees.manager'), request.managerName ?? '—'],
    [t('hr.leaves.type'), request.leaveTypeName],
    [t('hr.leaves.period'), request.startDate === request.endDate ? request.startDate : `${request.startDate} → ${request.endDate}`],
    [t('hr.leaves.days'), `${daysText(request.days)}${request.halfDay ? ` (${t('hr.leaves.halfDay')})` : ''}`],
    [t('hr.leaves.reason'), request.reason ?? '—'],
  ];
  if (request.decidedByName) rows.push([t('hr.leaves.decidedBy'), `${request.decidedByName} — ${request.decidedAt?.slice(0, 10) ?? ''}`]);
  if (request.decisionNote) rows.push([t('hr.leaves.decisionNote'), request.decisionNote]);
  const open = request.status === 'pending' || request.status === 'approved';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.number}
            <Badge variant={STATUS_VARIANT[request.status]}>{t(`hr.leaves.statuses.${request.status}`)}</Badge>
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {open && (canApprove || canManage) ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lv-note">{t('hr.leaves.decisionNote')}</Label>
              <Textarea id="lv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="text-destructive" disabled={decide.isPending} onClick={() => act('cancel')}>
                {t('hr.leaves.cancel')}
              </Button>
              {request.status === 'pending' && canApprove ? (
                <>
                  <Button variant="outline" disabled={decide.isPending} onClick={() => act('reject')}>
                    {t('hr.leaves.reject')}
                  </Button>
                  <Button disabled={decide.isPending} onClick={() => act('approve')}>
                    {t('hr.leaves.approve')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── balances ──────────────────────────────────────────────────────────────

/** أرصدة الإجازات — per employee and type for a year; edit the entitlement, close the year. */
export function LeaveBalancesPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [typeId, setTypeId] = useState('');
  const { data: types } = useLeaveTypes();
  const { data, isLoading } = useLeaveBalances({ year, leaveTypeId: typeId || undefined });
  const carry = useCarryOverLeave();
  const [editing, setEditing] = useState<LeaveBalanceDto | null>(null);

  async function onCarryOver() {
    if (!(await confirmDialog(t('hr.leaveBalances.carryConfirm', { from: year, to: year + 1 })))) return;
    try {
      const result = await carry.mutateAsync({ fromYear: year });
      toast.success(t('hr.leaveBalances.carried', { count: result.updated }));
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const columns = useMemo<ColumnDef<LeaveBalanceDto>[]>(
    () => [
      { accessorKey: 'employeeCode', header: t('hr.employees.code') },
      { accessorKey: 'employeeName', header: t('hr.attendance.employee'), cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span> },
      { accessorKey: 'leaveTypeName', header: t('hr.leaves.type') },
      {
        id: 'entitled',
        header: t('hr.leaveBalances.entitled'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {daysText(row.original.entitled)}
            {row.original.isCustom ? <span className="ms-1 text-xs text-primary">●</span> : null}
          </span>
        ),
      },
      { id: 'carried', header: t('hr.leaveBalances.carried'), cell: ({ row }) => daysText(row.original.carriedOver) },
      { id: 'adjustment', header: t('hr.leaveBalances.adjustment'), cell: ({ row }) => daysText(row.original.adjustment) },
      { id: 'used', header: t('hr.leaveBalances.used'), cell: ({ row }) => daysText(row.original.used) },
      { id: 'pending', header: t('hr.leaveBalances.pending'), cell: ({ row }) => daysText(row.original.pending) },
      {
        id: 'available',
        header: t('hr.leaveBalances.available'),
        cell: ({ row }) => (
          <span className={`font-semibold tabular-nums ${row.original.available < 0 ? 'text-destructive' : ''}`}>{daysText(row.original.available)}</span>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.leaveBalances.title')}
        description={t('hr.leaveBalances.subtitle')}
        actions={
          <Can permission={HR.leavesManage}>
            <Button variant="outline" onClick={onCarryOver} disabled={carry.isPending}>
              {t('hr.leaveBalances.carryOver', { to: year + 1 })}
            </Button>
          </Can>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
          {year - 1}
        </Button>
        <span className="px-2 font-semibold tabular-nums">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
          {year + 1}
        </Button>
        <Select value={typeId || ALL} onValueChange={(v) => setTypeId(v === ALL ? '' : v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('hr.leaveBalances.allTypes')}</SelectItem>
            {(types ?? [])
              .filter((x) => x.hasBalance && x.isActive)
              .map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('hr.employees.search')}
        onRowClick={(b) => setEditing(b)}
      />
      <BalanceDialog balance={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function BalanceDialog({ balance, onClose }: { balance: LeaveBalanceDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveLeaveBalance();
  const [form, setForm] = useState({ entitled: '', carried: '', adjustment: '', note: '' });
  const [openedFor, setOpenedFor] = useState<LeaveBalanceDto | null>(null);
  if (balance !== openedFor) {
    setOpenedFor(balance);
    if (balance) {
      setForm({ entitled: String(balance.entitled), carried: String(balance.carriedOver), adjustment: String(balance.adjustment), note: balance.note ?? '' });
    }
  }
  const half = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && Math.round(n * 2) === n * 2 ? n : null;
  };
  const entitled = half(form.entitled);
  const carried = half(form.carried);
  const adjustment = half(form.adjustment);
  const valid = entitled !== null && entitled >= 0 && carried !== null && carried >= 0 && adjustment !== null;

  async function submit() {
    if (!balance || !valid) return;
    try {
      await save.mutateAsync({
        employeeId: balance.employeeId,
        leaveTypeId: balance.leaveTypeId,
        year: balance.year,
        entitled: entitled!,
        carriedOver: carried!,
        adjustment: adjustment!,
        note: form.note.trim() || null,
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={balance !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{balance ? `${balance.employeeName} — ${balance.leaveTypeName} ${balance.year}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['entitled', t('hr.leaveBalances.entitled')],
                ['carried', t('hr.leaveBalances.carried')],
                ['adjustment', t('hr.leaveBalances.adjustment')],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`bal-${key}`}>{label}</Label>
                <Input id={`bal-${key}`} dir="ltr" inputMode="decimal" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('hr.leaveBalances.adjustmentHint')}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="bal-note">{t('hr.attendance.note')}</Label>
            <Input id="bal-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Can permission={HR.leavesManage}>
              <Button onClick={submit} disabled={!valid || save.isPending}>
                {t('common.save')}
              </Button>
            </Can>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── types ─────────────────────────────────────────────────────────────────

/** أنواع الإجازات. */
export function LeaveTypesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useLeaveTypes();
  const [editing, setEditing] = useState<LeaveTypeDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<LeaveTypeDto>[]>(
    () => [
      { accessorKey: 'name', header: t('hr.leaveTypes.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: 'pay', header: t('hr.leaveTypes.pay'), cell: ({ row }) => `${row.original.payPercent}%` },
      {
        id: 'balance',
        header: t('hr.leaveTypes.annualDays'),
        cell: ({ row }) => (row.original.hasBalance ? daysText(row.original.annualDays ?? 0) : <span className="text-muted-foreground">{t('hr.leaveTypes.noLimit')}</span>),
      },
      { id: 'carry', header: t('hr.leaveTypes.maxCarryOver'), cell: ({ row }) => (row.original.hasBalance ? daysText(row.original.maxCarryOver) : '—') },
      { id: 'parent', header: t('hr.leaveTypes.parent'), accessorFn: (r) => r.parentTypeName ?? '—' },
      {
        id: 'isActive',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.leaveTypes.title')}
        description={t('hr.leaveTypes.subtitle')}
        actions={
          <Can permission={HR.leavesManage}>
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.leaveTypes.add')}
            </Button>
          </Can>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} onRowClick={(x) => setEditing(x)} />
      <LeaveTypeDialog value={editing} types={data ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

function LeaveTypeDialog({ value, types, onClose }: { value: LeaveTypeDto | 'new' | null; types: LeaveTypeDto[]; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveLeaveType();
  const remove = useDeleteLeaveType();
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', pay: '100', hasBalance: true, annualDays: '', carry: '0', parentId: '', isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(
      existing
        ? {
            name: existing.name,
            pay: String(existing.payPercent),
            hasBalance: existing.hasBalance,
            annualDays: existing.annualDays === null ? '' : String(existing.annualDays),
            carry: String(existing.maxCarryOver),
            parentId: existing.parentTypeId ?? '',
            isActive: existing.isActive,
          }
        : blank,
    );
  }
  const pay = Number(form.pay);
  const annual = form.annualDays.trim() === '' ? null : Number(form.annualDays);
  const carry = Number(form.carry);
  const valid =
    form.name.trim() &&
    Number.isInteger(pay) &&
    pay >= 0 &&
    pay <= 100 &&
    (annual === null || (Number.isFinite(annual) && annual >= 0)) &&
    Number.isFinite(carry) &&
    carry >= 0;
  const parents = types.filter((x) => x.hasBalance && !x.parentTypeId && x.id !== existing?.id);

  async function submit() {
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          name: form.name,
          payPercent: pay,
          hasBalance: form.hasBalance,
          annualDays: form.hasBalance ? annual : null,
          maxCarryOver: form.hasBalance ? carry : 0,
          parentTypeId: form.hasBalance && form.parentId ? form.parentId : null,
          isActive: form.isActive,
        },
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  async function onDelete() {
    if (!existing || !(await confirmDialog(t('hr.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(t('hr.deleted'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? t('hr.leaveTypes.edit') : t('hr.leaveTypes.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="lt-name">{t('hr.leaveTypes.name')}</Label>
              <Input id="lt-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lt-pay">{t('hr.leaveTypes.payLong')}</Label>
              <Input id="lt-pay" dir="ltr" inputMode="numeric" value={form.pay} onChange={(e) => setForm({ ...form, pay: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.hasBalance} onCheckedChange={(v) => setForm({ ...form, hasBalance: v === true })} />
            {t('hr.leaveTypes.hasBalance')}
          </label>
          {form.hasBalance ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-annual">{t('hr.leaveTypes.annualDays')}</Label>
                  <Input id="lt-annual" dir="ltr" inputMode="decimal" value={form.annualDays} onChange={(e) => setForm({ ...form, annualDays: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-carry">{t('hr.leaveTypes.maxCarryOver')}</Label>
                  <Input id="lt-carry" dir="ltr" inputMode="decimal" value={form.carry} onChange={(e) => setForm({ ...form, carry: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('hr.leaveTypes.parent')}</Label>
                <Select value={form.parentId || NONE} onValueChange={(v) => setForm({ ...form, parentId: v === NONE ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('hr.none')}</SelectItem>
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('hr.leaveTypes.parentHint')}</p>
              </div>
            </>
          ) : null}
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t('common.active')}
            </label>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div>
              {existing ? (
                <Can permission={HR.leavesManage}>
                  <Button variant="ghost" className="text-destructive" onClick={onDelete}>
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Can permission={HR.leavesManage}>
                <Button onClick={submit} disabled={!valid || save.isPending}>
                  {t('common.save')}
                </Button>
              </Can>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
