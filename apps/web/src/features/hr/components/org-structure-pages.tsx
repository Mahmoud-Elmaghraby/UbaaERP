import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { HrDepartmentDto, HrJobTitleDto } from '@erp-platform/contracts';
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
} from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import {
  useDeleteDepartment,
  useDeleteJobTitle,
  useDepartments,
  useEmployees,
  useJobTitles,
  useSaveDepartment,
  useSaveJobTitle,
} from '../api/queries';

const NONE = '__none__';

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={active ? 'success' : 'neutral'} dot>
      {active ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

/** Save / delete / cancel row shared by both dialogs. */
function DialogActions({
  onDelete,
  onCancel,
  onSave,
  saveDisabled,
}: {
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        {onDelete ? (
          <Can permission={HR.employeesManage}>
            <Button variant="ghost" className="text-destructive" onClick={onDelete}>
              {t('common.delete')}
            </Button>
          </Can>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Can permission={HR.employeesManage}>
          <Button onClick={onSave} disabled={saveDisabled}>
            {t('common.save')}
          </Button>
        </Can>
      </div>
    </div>
  );
}

// ── departments ───────────────────────────────────────────────────────────

/** الإدارات والأقسام — a tree, each with an optional head. */
export function DepartmentsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useDepartments();
  const [editing, setEditing] = useState<HrDepartmentDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<HrDepartmentDto>[]>(
    () => [
      { accessorKey: 'name', header: t('hr.departments.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        id: 'parent',
        header: t('hr.departments.parent'),
        accessorFn: (row) => row.parentName ?? '',
        cell: ({ row }) => row.original.parentName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'manager',
        header: t('hr.departments.manager'),
        accessorFn: (row) => row.managerName ?? '',
        cell: ({ row }) => row.original.managerName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'employeeCount',
        header: t('hr.employeeCount'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.employeeCount}</span>,
      },
      { id: 'isActive', header: t('common.status'), cell: ({ row }) => <StatusBadge active={row.original.isActive} /> },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.departments.title')}
        description={t('hr.departments.subtitle')}
        actions={
          <Can permission={HR.employeesManage}>
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.departments.add')}
            </Button>
          </Can>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable onRowClick={(d) => setEditing(d)} />
      <DepartmentDialog value={editing} departments={data ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

function DepartmentDialog({
  value,
  departments,
  onClose,
}: {
  value: HrDepartmentDto | 'new' | null;
  departments: HrDepartmentDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveDepartment();
  const remove = useDeleteDepartment();
  const { data: employees } = useEmployees({ status: 'active' });
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', parentId: '', managerId: '', isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(
      existing
        ? { name: existing.name, parentId: existing.parentId ?? '', managerId: existing.managerId ?? '', isActive: existing.isActive }
        : blank,
    );
  }
  // The API refuses loops too; here a department simply can't pick itself.
  const parents = departments.filter((d) => d.id !== existing?.id);

  async function submit() {
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: { name: form.name, parentId: form.parentId || null, managerId: form.managerId || null, isActive: form.isActive },
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
          <DialogTitle>{existing ? t('hr.departments.edit') : t('hr.departments.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dep-name">{t('hr.departments.name')}</Label>
            <Input id="dep-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('hr.departments.parent')}</Label>
            <Select value={form.parentId || NONE} onValueChange={(id) => setForm({ ...form, parentId: id === NONE ? '' : id })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('hr.departments.noParent')}</SelectItem>
                {parents.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('hr.departments.manager')}</Label>
            <Select value={form.managerId || NONE} onValueChange={(id) => setForm({ ...form, managerId: id === NONE ? '' : id })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('hr.none')}</SelectItem>
                {existing?.managerId && !(employees ?? []).some((e) => e.id === existing.managerId) ? (
                  <SelectItem value={existing.managerId}>{existing.managerName}</SelectItem>
                ) : null}
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t('common.active')}
            </label>
          ) : null}
          <DialogActions
            onDelete={existing ? onDelete : undefined}
            onCancel={onClose}
            onSave={submit}
            saveDisabled={save.isPending || !form.name.trim()}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── job titles ────────────────────────────────────────────────────────────

/** المسميات الوظيفية. */
export function JobTitlesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useJobTitles();
  const [editing, setEditing] = useState<HrJobTitleDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<HrJobTitleDto>[]>(
    () => [
      { accessorKey: 'name', header: t('hr.jobTitles.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        id: 'description',
        header: t('hr.jobTitles.description'),
        accessorFn: (row) => row.description ?? '',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.description ?? '—'}</span>,
      },
      {
        accessorKey: 'employeeCount',
        header: t('hr.employeeCount'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.employeeCount}</span>,
      },
      { id: 'isActive', header: t('common.status'), cell: ({ row }) => <StatusBadge active={row.original.isActive} /> },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.jobTitles.title')}
        description={t('hr.jobTitles.subtitle')}
        actions={
          <Can permission={HR.employeesManage}>
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.jobTitles.add')}
            </Button>
          </Can>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable onRowClick={(j) => setEditing(j)} />
      <JobTitleDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function JobTitleDialog({ value, onClose }: { value: HrJobTitleDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveJobTitle();
  const remove = useDeleteJobTitle();
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', description: '', isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(existing ? { name: existing.name, description: existing.description ?? '', isActive: existing.isActive } : blank);
  }

  async function submit() {
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: { name: form.name, description: form.description.trim() || null, isActive: form.isActive },
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
          <DialogTitle>{existing ? t('hr.jobTitles.edit') : t('hr.jobTitles.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="job-name">{t('hr.jobTitles.name')}</Label>
            <Input id="job-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="job-desc">{t('hr.jobTitles.description')}</Label>
            <Textarea id="job-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t('common.active')}
            </label>
          ) : null}
          <DialogActions
            onDelete={existing ? onDelete : undefined}
            onCancel={onClose}
            onSave={submit}
            saveDisabled={save.isPending || !form.name.trim()}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
