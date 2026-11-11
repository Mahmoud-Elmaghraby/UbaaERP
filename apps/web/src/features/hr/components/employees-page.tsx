import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { EmployeeStatusDto, EmployeeSummaryDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  DataTable,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { HR } from '../../../lib/permissions';
import { useDepartments, useEmployees } from '../api/queries';
import { EmployeeStatusBadge } from './employee-status-badge';

const ALL = '__all__';
const STATUSES: EmployeeStatusDto[] = ['active', 'suspended', 'terminated'];

/** الموظفين — the list, filtered by status and department, searchable by name / code / phone / ID. */
export function EmployeesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<EmployeeStatusDto | ''>('active');
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments } = useDepartments();
  const { data, isLoading } = useEmployees({ status: status || undefined, departmentId: departmentId || undefined });

  const columns = useMemo<ColumnDef<EmployeeSummaryDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('hr.employees.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span>,
      },
      { accessorKey: 'fullName', header: t('hr.employees.fullName'), cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
      { id: 'jobTitle', header: t('hr.employees.jobTitle'), accessorFn: (r) => r.jobTitleName ?? '—' },
      { id: 'department', header: t('hr.employees.department'), accessorFn: (r) => r.departmentName ?? '—' },
      { id: 'branch', header: t('hr.employees.branch'), accessorFn: (r) => r.branchName ?? '—' },
      {
        id: 'phone',
        header: t('hr.employees.phone'),
        accessorFn: (r) => r.phone ?? '',
        cell: ({ row }) => (row.original.phone ? <span dir="ltr">{row.original.phone}</span> : '—'),
      },
      { accessorKey: 'hireDate', header: t('hr.employees.hireDate'), cell: ({ row }) => <span className="tabular-nums">{row.original.hireDate}</span> },
      { id: 'status', header: t('common.status'), cell: ({ row }) => <EmployeeStatusBadge status={row.original.status} /> },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('hr.employees.title')}
        description={t('hr.employees.subtitle')}
        actions={
          <Can permission={HR.employeesManage}>
            <Button onClick={() => navigate('/hr/employees/new')}>
              <Plus className="me-1 h-4 w-4" />
              {t('hr.employees.add')}
            </Button>
          </Can>
        }
      />
      <div className="flex flex-wrap gap-3">
        <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : (v as EmployeeStatusDto))}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('hr.employees.allStatuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`hr.employees.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('hr.employees.search')}
        onRowClick={(e) => navigate(`/hr/employees/${e.id}`)}
      />
    </div>
  );
}
