import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalaryRegisterRowDto } from '@erp-platform/contracts';
import {
  Checkbox,
  DataTable,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';

import { formatAmount, formatMoney } from '../../../lib/money';
import { useDepartments, useSalaryRegister } from '../api/queries';
import { EmployeeStatusBadge } from './employee-status-badge';

const ALL = '__all__';

function amount(minor: string | null) {
  return minor === null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{formatAmount(minor)}</span>;
}

/** كشف المرتبات — every employee's salary in force on a date, with totals. */
export function SalaryRegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentId, setDepartmentId] = useState('');
  const [includeTerminated, setIncludeTerminated] = useState(false);
  const { data: departments } = useDepartments();
  const { data, isLoading } = useSalaryRegister({
    asOf: asOf || undefined,
    departmentId: departmentId || undefined,
    includeTerminated: includeTerminated ? 'true' : undefined,
  });

  const columns = useMemo<ColumnDef<SalaryRegisterRowDto>[]>(
    () => [
      { accessorKey: 'code', header: t('hr.employees.code'), cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span> },
      { accessorKey: 'fullName', header: t('hr.employees.fullName'), cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
      { id: 'department', header: t('hr.employees.department'), accessorFn: (r) => r.departmentName ?? '—' },
      { id: 'job', header: t('hr.employees.jobTitle'), accessorFn: (r) => r.jobTitleName ?? '—' },
      { id: 'basic', header: t('hr.salary.basic'), cell: ({ row }) => amount(row.original.basicMinorUnits) },
      { id: 'earnings', header: t('hr.salary.earnings'), cell: ({ row }) => amount(row.original.earningsMinorUnits) },
      { id: 'deductions', header: t('hr.salary.deductions'), cell: ({ row }) => amount(row.original.deductionsMinorUnits) },
      {
        id: 'net',
        header: t('hr.salary.net'),
        cell: ({ row }) =>
          row.original.netMinorUnits === null ? (
            <span className="text-xs text-warning">{t('hr.salary.notSet')}</span>
          ) : (
            <span className="font-semibold tabular-nums">{formatAmount(row.original.netMinorUnits)}</span>
          ),
      },
      { id: 'status', header: t('common.status'), cell: ({ row }) => <EmployeeStatusBadge status={row.original.status} /> },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('hr.register.title')} description={t('hr.register.subtitle')} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="reg-asof">{t('hr.register.asOf')}</Label>
          <Input id="reg-asof" type="date" className="w-44" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
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
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={includeTerminated} onCheckedChange={(v) => setIncludeTerminated(v === true)} />
          {t('hr.register.includeTerminated')}
        </label>
      </div>
      {data ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ['basic', data.totals.basicMinorUnits],
              ['earnings', data.totals.earningsMinorUnits],
              ['deductions', data.totals.deductionsMinorUnits],
              ['net', data.totals.netMinorUnits],
            ] as const
          ).map(([key, minor]) => (
            <div key={key} className="rounded-xl border bg-card p-4 shadow-card">
              <p className="text-xs text-muted-foreground">{t(`hr.salary.${key}`)}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(minor, data.currency)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {data && data.withoutSalary > 0 ? (
        <p className="text-sm text-warning">{t('hr.register.withoutSalary', { count: data.withoutSalary })}</p>
      ) : null}
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('hr.employees.search')}
        onRowClick={(r) => navigate(`/hr/employees/${r.employeeId}`)}
      />
    </div>
  );
}
