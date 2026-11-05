import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalesRepDto, UserDto } from '@erp-platform/contracts';
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
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { ApiError, apiGet } from '../../../../lib/api-client';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { useDeleteSalesRep, useSalesReps, useSaveSalesRep } from '../../api/sales-reps/queries';

const NONE = '__none__';

/** المندوبين — sales representatives a sale counts for. */
export function SalesRepsPage() {
  const { t } = useTranslation();
  const { data: reps, isLoading } = useSalesReps();
  const [editing, setEditing] = useState<SalesRepDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<SalesRepDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('salesReps.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: t('salesReps.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'phone',
        header: t('salesReps.phone'),
        accessorFn: (row) => row.phone ?? '',
        cell: ({ row }) =>
          row.original.phone ? <span dir="ltr">{row.original.phone}</span> : <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'user',
        header: t('salesReps.user'),
        accessorFn: (row) => row.userName ?? '',
        cell: ({ row }) => row.original.userName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'commission',
        header: t('salesReps.commission'),
        cell: ({ row }) =>
          row.original.commissionPercentage !== null ? (
            <span className="tabular-nums">{row.original.commissionPercentage}%</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
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
        title={t('salesReps.title')}
        description={t('salesReps.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('salesReps.add')}
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={reps ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('salesReps.search')}
        onRowClick={(rep) => setEditing(rep)}
      />
      <SalesRepDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SalesRepDialog({ value, onClose }: { value: SalesRepDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveSalesRep();
  const remove = useDeleteSalesRep();
  // The user list is an admin endpoint — only asked for when the viewer may read it.
  const canListUsers = useHasPermission('users.manage');
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<UserDto[]>('/users'),
    enabled: canListUsers && value !== null,
  });
  const existing = value && value !== 'new' ? value : null;
  const blank = { code: '', name: '', phone: '', userId: '', commission: '', isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(
      existing
        ? {
            code: existing.code,
            name: existing.name,
            phone: existing.phone ?? '',
            userId: existing.userId ?? '',
            commission: existing.commissionPercentage === null ? '' : String(existing.commissionPercentage),
            isActive: existing.isActive,
          }
        : blank,
    );
  }
  const commission = form.commission.trim() === '' ? null : Number(form.commission);
  const commissionValid = commission === null || (Number.isFinite(commission) && commission >= 0 && commission <= 100);
  const userOptions = (users ?? []).map((u) => ({ id: u.id, name: u.fullName }));
  if (existing?.userId && !userOptions.some((u) => u.id === existing.userId)) {
    userOptions.unshift({ id: existing.userId, name: existing.userName ?? existing.userId });
  }

  async function submit() {
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          code: form.code,
          name: form.name,
          phone: form.phone.trim() || null,
          userId: form.userId || null,
          commissionPercentage: commission,
          isActive: form.isActive,
        },
      });
      toast.success(t('salesReps.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!existing || !(await confirmDialog(t('salesReps.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(t('salesReps.deleted'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? t('salesReps.edit') : t('salesReps.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rep-code">{t('salesReps.code')}</Label>
              <Input id="rep-code" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="rep-name">{t('salesReps.name')}</Label>
              <Input id="rep-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rep-phone">{t('salesReps.phone')}</Label>
              <Input id="rep-phone" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rep-commission">{t('salesReps.commission')}</Label>
              <Input
                id="rep-commission"
                dir="ltr"
                inputMode="decimal"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('salesReps.user')}</Label>
            <Select
              value={form.userId || NONE}
              onValueChange={(id) => setForm({ ...form, userId: id === NONE ? '' : id })}
              disabled={!canListUsers && !existing?.userId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('salesReps.noUser')}</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('salesReps.userHint')}</p>
          </div>
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t('common.active')}
            </label>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div>
              {existing ? (
                <Can permission="sales.manage">
                  <Button variant="ghost" className="text-destructive" onClick={onDelete} disabled={remove.isPending}>
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Can permission="sales.manage">
                <Button onClick={submit} disabled={save.isPending || !form.code.trim() || !form.name.trim() || !commissionValid}>
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
