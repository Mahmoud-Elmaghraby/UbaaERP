import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EmployeeDto, EmployeeSalaryDto, SalaryComponentDto } from '@erp-platform/contracts';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';
import { Plus, Trash2 } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { formatAmount, formatMoney, minorUnitsToDecimalString } from '../../../lib/money';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { SectionCard } from '../../../components/document/document-layout';
import { useDeleteEmployeeSalary, useEmployeeSalaries, useSalaryComponents, useSaveEmployeeSalary } from '../api/queries';
import { parseDefault } from './salary-components-page';

/** The salary card on the employee file — only for hr.salaries.view / .manage. */
export function EmployeeSalarySection({ employee }: { employee: EmployeeDto }) {
  return (
    <Can permission={[HR.salariesView, HR.salariesManage]}>
      <SalaryCard employee={employee} />
    </Can>
  );
}

function SalaryCard({ employee }: { employee: EmployeeDto }) {
  const { t } = useTranslation();
  const { data, isLoading } = useEmployeeSalaries(employee.id);
  const remove = useDeleteEmployeeSalary(employee.id);
  const [editing, setEditing] = useState<EmployeeSalaryDto | 'new' | null>(null);
  const writable = employee.status !== 'terminated';
  const current = data?.current ?? null;

  async function onDelete(revision: EmployeeSalaryDto) {
    if (!(await confirmDialog(t('hr.salary.deleteConfirm', { date: revision.effectiveFrom }), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(revision.id);
      toast.success(t('hr.deleted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <SectionCard
      title={t('hr.salary.title')}
      description={current ? t('hr.salary.since', { date: current.effectiveFrom }) : undefined}
      actions={
        writable ? (
          <Can permission={HR.salariesManage}>
            <Button type="button" size="sm" onClick={() => setEditing('new')}>
              <Plus className="me-1 h-4 w-4" />
              {t(current ? 'hr.salary.change' : 'hr.salary.set')}
            </Button>
          </Can>
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !current ? (
        <p className="text-sm text-muted-foreground">{t('hr.salary.none')}</p>
      ) : (
        <SalaryBreakdown salary={current} />
      )}

      {data && data.history.length > 0 ? (
        <div className="mt-5 grid gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t('hr.salary.history')}</p>
          <ul className="divide-y rounded-lg border">
            {data.history.map((rev) => (
              <li key={rev.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="tabular-nums">
                  {rev.effectiveFrom}
                  {rev.effectiveTo ? ` → ${rev.effectiveTo}` : ''}
                </span>
                {rev.id === current?.id ? <Badge variant="success">{t('hr.salary.current')}</Badge> : null}
                {rev.effectiveFrom > (current?.effectiveFrom ?? '') && rev.id !== current?.id ? (
                  <Badge variant="info">{t('hr.salary.upcoming')}</Badge>
                ) : null}
                <span className="ms-auto tabular-nums">
                  {t('hr.salary.net')}: {formatMoney(rev.netMinorUnits, rev.currency)}
                </span>
                {writable ? (
                  <Can permission={HR.salariesManage}>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(rev)}>
                      {t('common.edit')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" aria-label={t('common.delete')} onClick={() => onDelete(rev)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Can>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <SalaryDialog employee={employee} value={editing} base={current} onClose={() => setEditing(null)} />
    </SectionCard>
  );
}

function SalaryBreakdown({ salary }: { salary: EmployeeSalaryDto }) {
  const { t } = useTranslation();
  const row = (label: string, minor: string, tone?: 'plus' | 'minus' | 'total') => (
    <div className={`flex justify-between gap-4 py-1 ${tone === 'total' ? 'border-t pt-2 font-semibold' : ''}`}>
      <span className={tone === 'minus' ? 'text-destructive' : undefined}>{label}</span>
      <span className="tabular-nums">
        {tone === 'minus' ? '− ' : tone === 'plus' ? '+ ' : ''}
        {formatAmount(minor)}
      </span>
    </div>
  );
  return (
    <div className="grid max-w-md text-sm">
      {row(t('hr.salary.basic'), salary.basicMinorUnits)}
      {salary.lines.map((l) => (
        <div key={l.componentId}>
          {row(l.percent !== null ? `${l.componentName} (${l.percent}%)` : l.componentName, l.valueMinorUnits, l.kind === 'earning' ? 'plus' : 'minus')}
        </div>
      ))}
      {row(`${t('hr.salary.net')} (${salary.currency})`, salary.netMinorUnits, 'total')}
    </div>
  );
}

interface LineDraft {
  componentId: string;
  value: string;
}

function SalaryDialog({
  employee,
  value,
  base,
  onClose,
}: {
  employee: EmployeeDto;
  value: EmployeeSalaryDto | 'new' | null;
  /** A new revision starts as a copy of the salary in force. */
  base: EmployeeSalaryDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveEmployeeSalary(employee.id);
  const { data: components } = useSalaryComponents(value !== null);
  const existing = value && value !== 'new' ? value : null;
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [basic, setBasic] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    const source = existing ?? base;
    const firstOfMonth = new Date().toISOString().slice(0, 8) + '01';
    setEffectiveFrom(existing?.effectiveFrom ?? (firstOfMonth < employee.hireDate ? employee.hireDate : firstOfMonth));
    setBasic(source ? minorUnitsToDecimalString(source.basicMinorUnits) : '');
    setNotes(existing?.notes ?? '');
    setLines(
      (source?.lines ?? []).map((l) => ({
        componentId: l.componentId,
        value: l.percent !== null ? String(l.percent) : l.amountMinorUnits ? minorUnitsToDecimalString(l.amountMinorUnits) : '',
      })),
    );
  }

  const byId = new Map((components ?? []).map((c) => [c.id, c]));
  const onRevision = new Set(existing?.lines.map((l) => l.componentId) ?? []);
  const available = (components ?? []).filter((c) => (c.isActive || onRevision.has(c.id)) && !lines.some((l) => l.componentId === c.id));
  const basicMinor = parseDefault('fixed', basic);
  const parsedLines = lines.map((l) => {
    const c = byId.get(l.componentId);
    return { line: l, component: c, parsed: c ? parseDefault(c.calculation, l.value) : undefined };
  });
  const valid = typeof basicMinor === 'string' && Boolean(effectiveFrom) && parsedLines.every((p) => p.component && p.parsed !== undefined);

  function addLine(component: SalaryComponentDto) {
    const initial =
      component.calculation === 'fixed'
        ? component.defaultAmountMinorUnits
          ? minorUnitsToDecimalString(component.defaultAmountMinorUnits)
          : ''
        : component.defaultPercent !== null
          ? String(component.defaultPercent)
          : '';
    setLines([...lines, { componentId: component.id, value: initial }]);
  }

  async function submit() {
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          effectiveFrom,
          basicMinorUnits: basicMinor as string,
          notes: notes.trim() || null,
          lines: parsedLines.map(({ component, parsed, line }) =>
            component!.calculation === 'fixed'
              ? { componentId: line.componentId, amountMinorUnits: (parsed as string | null) ?? null }
              : { componentId: line.componentId, percent: (parsed as number | null) ?? null },
          ),
        },
      });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? t('hr.salary.editRevision') : t('hr.salary.newRevision', { name: employee.fullName })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sal-from">{t('hr.salary.effectiveFrom')}</Label>
              <Input id="sal-from" type="date" min={employee.hireDate} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sal-basic">{t('hr.salary.basic')}</Label>
              <Input
                id="sal-basic"
                dir="ltr"
                inputMode="decimal"
                value={basic}
                aria-invalid={typeof basicMinor !== 'string'}
                onChange={(e) => setBasic(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium">{t('hr.salary.components')}</p>
            {parsedLines.length === 0 ? <p className="text-xs text-muted-foreground">{t('hr.salary.noComponents')}</p> : null}
            {parsedLines.map(({ line, component, parsed }, index) => (
              <div key={line.componentId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {component?.name ?? '…'}
                  {component ? (
                    <span className="ms-2 text-xs text-muted-foreground">{t(`hr.salaryComponents.kinds.${component.kind}`)}</span>
                  ) : null}
                </span>
                <Input
                  className="w-28"
                  dir="ltr"
                  inputMode="decimal"
                  value={line.value}
                  aria-invalid={parsed === undefined}
                  aria-label={component?.name}
                  onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, value: e.target.value } : l)))}
                />
                <span className="w-6 text-xs text-muted-foreground">{component?.calculation === 'percent_of_basic' ? '%' : ''}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('common.delete')}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {available.length > 0 ? (
              <Select value="" onValueChange={(id) => byId.get(id) && addLine(byId.get(id)!)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={t('hr.salary.addComponent')} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {t(`hr.salaryComponents.kinds.${c.kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (components ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('hr.salary.defineComponentsHint')}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sal-notes">{t('hr.salary.notes')}</Label>
            <Textarea id="sal-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('hr.salary.notesPlaceholder')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={save.isPending || !valid}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
