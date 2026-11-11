import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalaryComponentCalculationDto, SalaryComponentDto, SalaryComponentKindDto } from '@erp-platform/contracts';
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
} from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { decimalToMinorUnits, formatAmount, minorUnitsToDecimalString } from '../../../lib/money';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { useDeleteSalaryComponent, useSalaryComponents, useSaveSalaryComponent } from '../api/queries';

/** The default value of a component, as shown in lists: "12.5%" or "500.00". */
export function componentDefaultText(c: Pick<SalaryComponentDto, 'calculation' | 'defaultAmountMinorUnits' | 'defaultPercent'>) {
  if (c.calculation === 'percent_of_basic') return c.defaultPercent === null ? '—' : `${c.defaultPercent}%`;
  return c.defaultAmountMinorUnits === null ? '—' : formatAmount(c.defaultAmountMinorUnits);
}

/** البدلات والاستقطاعات — the recurring parts of a salary. */
export function SalaryComponentsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useSalaryComponents();
  const [editing, setEditing] = useState<SalaryComponentDto | 'new' | null>(null);

  const columns = useMemo<ColumnDef<SalaryComponentDto>[]>(
    () => [
      { accessorKey: 'name', header: t('hr.salaryComponents.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        id: 'kind',
        header: t('hr.salaryComponents.kind'),
        cell: ({ row }) => (
          <Badge variant={row.original.kind === 'earning' ? 'info' : 'warning'}>{t(`hr.salaryComponents.kinds.${row.original.kind}`)}</Badge>
        ),
      },
      { id: 'calculation', header: t('hr.salaryComponents.calculation'), accessorFn: (r) => t(`hr.salaryComponents.calculations.${r.calculation}`) },
      {
        id: 'default',
        header: t('hr.salaryComponents.default'),
        cell: ({ row }) => <span className="tabular-nums">{componentDefaultText(row.original)}</span>,
      },
      { accessorKey: 'employeeCount', header: t('hr.employeeCount'), cell: ({ row }) => <span className="tabular-nums">{row.original.employeeCount}</span> },
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
        title={t('hr.salaryComponents.title')}
        description={t('hr.salaryComponents.subtitle')}
        actions={
          <Can permission={HR.salariesManage}>
            <Button onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.salaryComponents.add')}
            </Button>
          </Can>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} searchable onRowClick={(c) => setEditing(c)} />
      <ComponentDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ComponentDialog({ value, onClose }: { value: SalaryComponentDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveSalaryComponent();
  const remove = useDeleteSalaryComponent();
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', kind: 'earning' as SalaryComponentKindDto, calculation: 'fixed' as SalaryComponentCalculationDto, value: '', isActive: true };
  const [form, setForm] = useState(blank);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm(
      existing
        ? {
            name: existing.name,
            kind: existing.kind,
            calculation: existing.calculation,
            value:
              existing.calculation === 'fixed'
                ? existing.defaultAmountMinorUnits === null
                  ? ''
                  : minorUnitsToDecimalString(existing.defaultAmountMinorUnits)
                : existing.defaultPercent === null
                  ? ''
                  : String(existing.defaultPercent),
            isActive: existing.isActive,
          }
        : blank,
    );
  }
  // A used component keeps its meaning (the API refuses too).
  const typeLocked = Boolean(existing && existing.employeeCount > 0);
  const parsed = parseDefault(form.calculation, form.value);

  async function submit() {
    if (parsed === undefined) return;
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          name: form.name,
          kind: form.kind,
          calculation: form.calculation,
          defaultAmountMinorUnits: form.calculation === 'fixed' ? (parsed as string | null) : null,
          defaultPercent: form.calculation === 'percent_of_basic' ? (parsed as number | null) : null,
          isActive: form.isActive,
        },
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!existing || !(await confirmDialog(t('hr.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(t('hr.deleted'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? t('hr.salaryComponents.edit') : t('hr.salaryComponents.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="comp-name">{t('hr.salaryComponents.name')}</Label>
            <Input id="comp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('hr.salaryComponents.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('hr.salaryComponents.kind')}</Label>
              <Select value={form.kind} disabled={typeLocked} onValueChange={(v) => setForm({ ...form, kind: v as SalaryComponentKindDto })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">{t('hr.salaryComponents.kinds.earning')}</SelectItem>
                  <SelectItem value="deduction">{t('hr.salaryComponents.kinds.deduction')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('hr.salaryComponents.calculation')}</Label>
              <Select
                value={form.calculation}
                disabled={typeLocked}
                onValueChange={(v) => setForm({ ...form, calculation: v as SalaryComponentCalculationDto, value: '' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t('hr.salaryComponents.calculations.fixed')}</SelectItem>
                  <SelectItem value="percent_of_basic">{t('hr.salaryComponents.calculations.percent_of_basic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {typeLocked ? <p className="text-xs text-muted-foreground">{t('hr.salaryComponents.typeLocked')}</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="comp-default">
              {t(form.calculation === 'fixed' ? 'hr.salaryComponents.defaultAmount' : 'hr.salaryComponents.defaultPercent')}
            </Label>
            <Input
              id="comp-default"
              dir="ltr"
              inputMode="decimal"
              value={form.value}
              aria-invalid={parsed === undefined}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t('hr.salaryComponents.defaultHint')}</p>
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
                <Can permission={HR.salariesManage}>
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
              <Can permission={HR.salariesManage}>
                <Button onClick={submit} disabled={save.isPending || !form.name.trim() || parsed === undefined}>
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

/** '' → null; a valid amount → minor units; a valid percent → number; anything else → undefined (invalid). */
export function parseDefault(calculation: SalaryComponentCalculationDto, text: string): string | number | null | undefined {
  if (text.trim() === '') return null;
  if (calculation === 'percent_of_basic') {
    const n = Number(text.trim().replace('٫', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined;
  }
  try {
    const minor = decimalToMinorUnits(text);
    return BigInt(minor) >= 0n ? minor : undefined;
  } catch {
    return undefined;
  }
}
