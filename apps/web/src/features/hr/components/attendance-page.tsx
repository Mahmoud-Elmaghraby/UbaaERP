import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { AttendanceDayDto, AttendanceStatusDto, AttendanceSummaryRowDto } from '@erp-platform/contracts';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { RefreshCw, Upload } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { useAttendance, useAttendanceSummary, useDepartments, useRebuildAttendance, useResetAttendanceDay, useUpdateAttendanceDay } from '../api/queries';
import { clockInput, currentMonth, formatClock, formatDuration, parseClock } from '../lib/minutes';

const ALL = '__all__';
const STATUSES: AttendanceStatusDto[] = ['present', 'absent', 'weekend', 'holiday', 'leave'];
const STATUS_VARIANT: Record<AttendanceStatusDto, 'success' | 'danger' | 'neutral' | 'info' | 'warning'> = {
  present: 'success',
  absent: 'danger',
  weekend: 'neutral',
  holiday: 'info',
  leave: 'warning',
};

function minutesCell(value: number) {
  return value ? <span className="tabular-nums">{formatDuration(value)}</span> : <span className="text-muted-foreground">—</span>;
}

/** الحضور والانصراف — the daily sheet and the per-employee summary for a period. */
export function AttendancePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [range, setRange] = useState(currentMonth);
  const [departmentId, setDepartmentId] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [tab, setTab] = useState('days');
  const [editing, setEditing] = useState<AttendanceDayDto | null>(null);
  const canManage = useHasPermission(HR.attendanceManage);
  const { data: departments } = useDepartments();
  const query = { from: range.from, to: range.to, departmentId: departmentId || undefined };
  const { data: days, isLoading } = useAttendance({ ...query, exceptionsOnly: exceptionsOnly ? 'true' : undefined });
  const { data: summary, isLoading: summaryLoading } = useAttendanceSummary(query, tab === 'summary');
  const rebuild = useRebuildAttendance();

  async function onRebuild() {
    try {
      const result = await rebuild.mutateAsync({ from: range.from, to: range.to });
      toast.success(t('hr.attendance.rebuilt', { days: result.days, kept: result.keptManual }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const dayColumns = useMemo<ColumnDef<AttendanceDayDto>[]>(
    () => [
      { accessorKey: 'workDate', header: t('hr.attendance.date'), cell: ({ row }) => <span className="tabular-nums">{row.original.workDate}</span> },
      {
        id: 'employee',
        header: t('hr.attendance.employee'),
        accessorFn: (r) => `${r.employeeName} ${r.employeeCode}`,
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.employeeName}</span>{' '}
            <span className="text-xs text-muted-foreground tabular-nums">{row.original.employeeCode}</span>
          </span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[row.original.status]}>{t(`hr.attendance.statuses.${row.original.status}`)}</Badge>
            {row.original.missingPunch ? <Badge variant="warning">{t('hr.attendance.missingPunch')}</Badge> : null}
            {row.original.isManual ? <Badge variant="outline">{t('hr.attendance.manual')}</Badge> : null}
          </span>
        ),
      },
      { id: 'in', header: t('hr.attendance.checkIn'), cell: ({ row }) => <span className="tabular-nums" dir="ltr">{formatClock(row.original.checkInMinute)}</span> },
      { id: 'out', header: t('hr.attendance.checkOut'), cell: ({ row }) => <span className="tabular-nums" dir="ltr">{formatClock(row.original.checkOutMinute)}</span> },
      { id: 'worked', header: t('hr.attendance.worked'), cell: ({ row }) => minutesCell(row.original.workedMinutes) },
      { id: 'late', header: t('hr.attendance.late'), cell: ({ row }) => minutesCell(row.original.lateMinutes) },
      { id: 'early', header: t('hr.attendance.early'), cell: ({ row }) => minutesCell(row.original.earlyLeaveMinutes) },
      { id: 'overtime', header: t('hr.attendance.overtime'), cell: ({ row }) => minutesCell(row.original.overtimeMinutes) },
    ],
    [t],
  );

  const summaryColumns = useMemo<ColumnDef<AttendanceSummaryRowDto>[]>(
    () => [
      { accessorKey: 'employeeCode', header: t('hr.employees.code') },
      { accessorKey: 'employeeName', header: t('hr.attendance.employee'), cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span> },
      { id: 'department', header: t('hr.employees.department'), accessorFn: (r) => r.departmentName ?? '—' },
      { accessorKey: 'workDays', header: t('hr.attendance.workDays') },
      { accessorKey: 'presentDays', header: t('hr.attendance.statuses.present') },
      {
        accessorKey: 'absentDays',
        header: t('hr.attendance.statuses.absent'),
        cell: ({ row }) => <span className={row.original.absentDays ? 'font-semibold text-destructive' : undefined}>{row.original.absentDays}</span>,
      },
      { accessorKey: 'leaveDays', header: t('hr.attendance.statuses.leave') },
      { accessorKey: 'missingPunchDays', header: t('hr.attendance.missingPunch') },
      { id: 'late', header: t('hr.attendance.late'), cell: ({ row }) => minutesCell(row.original.lateMinutes) },
      { id: 'early', header: t('hr.attendance.early'), cell: ({ row }) => minutesCell(row.original.earlyLeaveMinutes) },
      { id: 'overtime', header: t('hr.attendance.overtime'), cell: ({ row }) => minutesCell(row.original.overtimeMinutes) },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.attendance.title')}
        description={t('hr.attendance.subtitle')}
        actions={
          <Can permission={HR.attendanceManage}>
            <Button variant="outline" onClick={onRebuild} disabled={rebuild.isPending}>
              <RefreshCw className="me-1 h-4 w-4" />
              {t('hr.attendance.rebuild')}
            </Button>
            <Button onClick={() => navigate('/hr/attendance/import')}>
              <Upload className="me-1 h-4 w-4" />
              {t('hr.attendance.import')}
            </Button>
          </Can>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="att-from">{t('hr.attendance.from')}</Label>
          <Input id="att-from" type="date" className="w-44" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="att-to">{t('hr.attendance.to')}</Label>
          <Input id="att-to" type="date" className="w-44" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
        <Select value={departmentId || ALL} onValueChange={(v) => setDepartmentId(v === ALL ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('hr.employees.allDepartments')}</SelectItem>
            {(departments ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="days">{t('hr.attendance.tabs.days')}</TabsTrigger>
          <TabsTrigger value="summary">{t('hr.attendance.tabs.summary')}</TabsTrigger>
        </TabsList>
        <TabsContent value="days" className="mt-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={exceptionsOnly} onCheckedChange={(v) => setExceptionsOnly(v === true)} />
            {t('hr.attendance.exceptionsOnly')}
          </label>
          <DataTable
            columns={dayColumns}
            data={days ?? []}
            isLoading={isLoading}
            searchable
            searchPlaceholder={t('hr.employees.search')}
            onRowClick={canManage ? (d) => setEditing(d) : undefined}
          />
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <DataTable columns={summaryColumns} data={summary ?? []} isLoading={summaryLoading} searchable searchPlaceholder={t('hr.employees.search')} />
        </TabsContent>
      </Tabs>
      <DayDialog day={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Correct one day by hand (forgotten punch, mission outside, wrong status). */
function DayDialog({ day, onClose }: { day: AttendanceDayDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateAttendanceDay();
  const reset = useResetAttendanceDay();
  const [form, setForm] = useState({ status: 'present' as AttendanceStatusDto, checkIn: '', checkOut: '', note: '' });
  const [openedFor, setOpenedFor] = useState<AttendanceDayDto | null>(null);
  if (day !== openedFor) {
    setOpenedFor(day);
    if (day) {
      setForm({ status: day.status, checkIn: clockInput(day.checkInMinute), checkOut: clockInput(day.checkOutMinute), note: day.note ?? '' });
    }
  }
  const timed = form.status === 'present' || form.status === 'weekend' || form.status === 'holiday';

  async function submit() {
    if (!day) return;
    try {
      await update.mutateAsync({
        id: day.id,
        input: {
          status: form.status,
          checkInMinute: timed ? parseClock(form.checkIn) : null,
          checkOutMinute: timed ? parseClock(form.checkOut) : null,
          note: form.note.trim() || null,
        },
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onReset() {
    if (!day) return;
    try {
      await reset.mutateAsync(day.id);
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{day ? t('hr.attendance.editTitle', { name: day.employeeName, date: day.workDate }) : ''}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('common.status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatusDto })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`hr.attendance.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {timed ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="day-in">{t('hr.attendance.checkIn')}</Label>
                <Input id="day-in" type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="day-out">{t('hr.attendance.checkOut')}</Label>
                <Input id="day-out" type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
              </div>
            </div>
          ) : null}
          {timed ? <p className="text-xs text-muted-foreground">{t('hr.attendance.nextDayHint')}</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="day-note">{t('hr.attendance.note')}</Label>
            <Textarea id="day-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              {day?.isManual ? (
                <Button variant="ghost" onClick={onReset} disabled={reset.isPending}>
                  {t('hr.attendance.resetManual')}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submit} disabled={update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
