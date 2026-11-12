import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { HrHolidayDto, HrShiftDto } from '@erp-platform/contracts';
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
  toast,
} from '@erp-platform/ui';
import { Plus, Trash2 } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { useAddHolidays, useDeleteHoliday, useDeleteShift, useHolidays, useSaveShift, useShifts } from '../api/queries';
import { clockInput, formatClock, formatDuration, parseClock } from '../lib/minutes';

/** Sunday-first weekday indexes, shown Saturday-first like an Egyptian week. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

// ── shifts ────────────────────────────────────────────────────────────────

/** الورديات — working hours, grace, break and weekly days off. */
export function ShiftsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useShifts();
  const [editing, setEditing] = useState<HrShiftDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<HrShiftDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('hr.shifts.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.isDefault ? <Badge variant="brand">{t('hr.shifts.default')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'hours',
        header: t('hr.shifts.hours'),
        cell: ({ row }) => (
          <span className="tabular-nums" dir="ltr">
            {formatClock(row.original.startMinute)} – {formatClock(row.original.endMinute)}
          </span>
        ),
      },
      { id: 'scheduled', header: t('hr.shifts.scheduled'), cell: ({ row }) => <span className="tabular-nums">{formatDuration(row.original.scheduledMinutes)}</span> },
      { accessorKey: 'graceMinutes', header: t('hr.shifts.grace') },
      {
        id: 'off',
        header: t('hr.shifts.weeklyOff'),
        accessorFn: (r) => r.weeklyOffDays.map((d) => t(`hr.weekdays.${d}`)).join('، ') || '—',
      },
      { accessorKey: 'employeeCount', header: t('hr.employeeCount') },
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
        title={t('hr.shifts.title')}
        description={t('hr.shifts.subtitle')}
        actions={
          <Can permission={HR.attendanceManage}>
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.shifts.add')}
            </Button>
          </Can>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} onRowClick={(s) => setEditing(s)} />
      <ShiftDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ShiftDialog({ value, onClose }: { value: HrShiftDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveShift();
  const remove = useDeleteShift();
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', start: '09:00', end: '17:00', grace: '15', breakMinutes: '0', off: [5], isDefault: false, isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(
      existing
        ? {
            name: existing.name,
            start: clockInput(existing.startMinute),
            end: clockInput(existing.endMinute),
            grace: String(existing.graceMinutes),
            breakMinutes: String(existing.breakMinutes),
            off: existing.weeklyOffDays,
            isDefault: existing.isDefault,
            isActive: existing.isActive,
          }
        : blank,
    );
  }
  const start = parseClock(form.start);
  const end = parseClock(form.end);
  const grace = Number(form.grace);
  const brk = Number(form.breakMinutes);
  const valid =
    form.name.trim() && start !== null && end !== null && start !== end && Number.isInteger(grace) && grace >= 0 && grace <= 240 && Number.isInteger(brk) && brk >= 0 && brk <= 480;

  async function submit() {
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          name: form.name,
          startMinute: start!,
          endMinute: end!,
          graceMinutes: grace,
          breakMinutes: brk,
          weeklyOffDays: form.off,
          isDefault: form.isDefault,
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
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? t('hr.shifts.edit') : t('hr.shifts.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="shift-name">{t('hr.shifts.name')}</Label>
            <Input id="shift-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shift-start">{t('hr.shifts.start')}</Label>
              <Input id="shift-start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-end">{t('hr.shifts.end')}</Label>
              <Input id="shift-end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </div>
          </div>
          {start !== null && end !== null && end <= start ? <p className="text-xs text-muted-foreground">{t('hr.shifts.overnight')}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shift-grace">{t('hr.shifts.graceLong')}</Label>
              <Input id="shift-grace" dir="ltr" inputMode="numeric" value={form.grace} onChange={(e) => setForm({ ...form, grace: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-break">{t('hr.shifts.break')}</Label>
              <Input id="shift-break" dir="ltr" inputMode="numeric" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('hr.shifts.weeklyOff')}</Label>
            <div className="flex flex-wrap gap-3">
              {WEEK.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={form.off.includes(d)}
                    onCheckedChange={(v) => setForm({ ...form, off: v === true ? [...form.off, d] : form.off.filter((x) => x !== d) })}
                  />
                  {t(`hr.weekdays.${d}`)}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isDefault} disabled={existing?.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v === true })} />
              {t('hr.shifts.makeDefault')}
            </label>
            {existing && !existing.isDefault ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
                {t('common.active')}
              </label>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              {existing && !existing.isDefault ? (
                <Can permission={HR.attendanceManage}>
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
              <Can permission={HR.attendanceManage}>
                <Button onClick={submit} disabled={save.isPending || !valid}>
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

// ── public holidays ───────────────────────────────────────────────────────

/** الإجازات الرسمية — by year; a holiday of several days is one entry per day. */
export function HolidaysPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading } = useHolidays(year);
  const add = useAddHolidays();
  const remove = useDeleteHoliday();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [days, setDays] = useState('1');

  async function submit() {
    const count = Number(days);
    if (!name.trim() || !from || !Number.isInteger(count) || count < 1 || count > 31) return;
    const [y, m, d] = from.split('-').map(Number) as [number, number, number];
    const dates = Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
    try {
      await add.mutateAsync({ name, dates });
      toast.success(t('hr.saved'));
      setName('');
      setFrom('');
      setDays('1');
      setYear(y);
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  async function onDelete(h: HrHolidayDto) {
    if (!(await confirmDialog(t('hr.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(h.id);
    } catch (err) {
      toast.error(errorText(err, t('common.error')));
    }
  }

  const columns: ColumnDef<HrHolidayDto>[] = [
    { accessorKey: 'date', header: t('hr.holidays.date'), cell: ({ row }) => <span className="tabular-nums">{row.original.date}</span> },
    { id: 'weekday', header: t('hr.holidays.weekday'), accessorFn: (r) => t(`hr.weekdays.${new Date(`${r.date}T00:00:00Z`).getUTCDay()}`) },
    { accessorKey: 'name', header: t('hr.holidays.name') },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Can permission={HR.attendanceManage}>
          <Button variant="ghost" size="sm" className="text-destructive" aria-label={t('common.delete')} onClick={() => onDelete(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader title={t('hr.holidays.title')} description={t('hr.holidays.subtitle')} />
      <Can permission={HR.attendanceManage}>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="hol-name">{t('hr.holidays.name')}</Label>
            <Input id="hol-name" className="w-56" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('hr.holidays.namePlaceholder')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hol-from">{t('hr.holidays.firstDay')}</Label>
            <Input id="hol-from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hol-days">{t('hr.holidays.days')}</Label>
            <Input id="hol-days" className="w-20" dir="ltr" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={add.isPending || !name.trim() || !from}>
            <Plus className="me-1 h-4 w-4" />
            {t('hr.holidays.add')}
          </Button>
        </div>
      </Can>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
          {year - 1}
        </Button>
        <span className="px-2 font-semibold tabular-nums">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
          {year + 1}
        </Button>
      </div>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} />
    </div>
  );
}
