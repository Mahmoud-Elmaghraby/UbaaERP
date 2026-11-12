import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { HrOverviewDto } from '@erp-platform/contracts';
import { Button, PageHeader, Skeleton } from '@erp-platform/ui';

import { apiGet } from '../../../lib/api-client';
import { formatAmount, formatMoney } from '../../../lib/money';
import { SectionCard } from '../../../components/document/document-layout';

/** الموارد البشرية — the year at a glance: people, movement, payroll cost, what needs renewing. */
export function HrOverviewPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'reports', 'overview', year],
    queryFn: () => apiGet<HrOverviewDto>(`/hr/reports/overview?year=${year}`),
  });

  return (
    <div className="grid gap-5">
      <PageHeader title={t('hr.overview.title')} description={t('hr.overview.subtitle')} />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
          {year - 1}
        </Button>
        <span className="px-2 font-semibold tabular-nums">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
          {year + 1}
        </Button>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <Overview data={data} />
      )}
    </div>
  );
}

function Overview({ data }: { data: HrOverviewDto }) {
  const { t } = useTranslation();
  const hires = data.movement.reduce((s, m) => s + m.hires, 0);
  const leavers = data.movement.reduce((s, m) => s + m.leavers, 0);
  const yearCost = data.payrollCost?.reduce((s, m) => s + BigInt(m.expenseMinorUnits), 0n).toString() ?? null;
  const cards: [string, string][] = [
    [t('hr.overview.active'), String(data.headcount.active)],
    [t('hr.overview.hiresLeavers'), `${hires} / ${leavers}`],
    ...(yearCost !== null ? ([[t('hr.overview.yearCost'), formatMoney(yearCost, data.currency)]] as [string, string][]) : []),
    ...(data.openLoans ? ([[t('hr.overview.openLoans', { count: data.openLoans.count }), formatMoney(data.openLoans.remainingMinorUnits, data.currency)]] as [string, string][]) : []),
  ];
  const maxCost = data.payrollCost ? data.payrollCost.reduce((m, r) => (BigInt(r.expenseMinorUnits) > m ? BigInt(r.expenseMinorUnits) : m), 0n) : 0n;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-card">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {data.expiringIds.length ? (
        <SectionCard title={t('hr.overview.expiringIds')}>
          <ul className="grid gap-1 text-sm">
            {data.expiringIds.map((e) => (
              <li key={e.employeeId}>
                <Link to={`/hr/employees/${e.employeeId}`} className="font-medium text-primary hover:underline">
                  {e.fullName}
                </Link>{' '}
                <span className="tabular-nums text-muted-foreground">
                  ({e.code}) — {e.expiry}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t('hr.overview.byDepartment')}>
          <table className="w-full text-sm">
            <tbody>
              {data.headcount.byDepartment.map((d) => (
                <tr key={d.departmentName ?? '—'} className="border-t first:border-t-0">
                  <td className="py-1.5">{d.departmentName ?? t('hr.overview.noDepartment')}</td>
                  <td className="py-1.5 text-end tabular-nums">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title={t('hr.overview.movement')}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-start">{t('hr.payroll.month')}</th>
                <th className="py-1 text-end">{t('hr.overview.hires')}</th>
                <th className="py-1 text-end">{t('hr.overview.leavers')}</th>
              </tr>
            </thead>
            <tbody>
              {data.movement.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="py-1 tabular-nums">{m.month}</td>
                  <td className="py-1 text-end tabular-nums">{m.hires || '—'}</td>
                  <td className="py-1 text-end tabular-nums">{m.leavers || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      {data.payrollCost ? (
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <SectionCard title={t('hr.overview.payrollCost')} description={t('hr.overview.payrollCostHint')}>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-start">{t('hr.payroll.month')}</th>
                  <th className="py-1 text-end">{t('hr.employeeCount')}</th>
                  <th className="py-1 text-end">{t('hr.payroll.gross')}</th>
                  <th className="py-1 text-end">{t('hr.salary.net')}</th>
                  <th className="w-1/3 py-1 text-end">{t('hr.overview.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {data.payrollCost.map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="py-1 tabular-nums">{m.month}</td>
                    <td className="py-1 text-end tabular-nums">{m.employees || '—'}</td>
                    <td className="py-1 text-end tabular-nums">{m.employees ? formatAmount(m.grossMinorUnits) : '—'}</td>
                    <td className="py-1 text-end tabular-nums">{m.employees ? formatAmount(m.netMinorUnits) : '—'}</td>
                    <td className="py-1">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">{m.employees ? formatAmount(m.expenseMinorUnits) : '—'}</span>
                        <span
                          className="h-2 rounded-full bg-primary/70"
                          style={{ width: `${maxCost > 0n ? Number((BigInt(m.expenseMinorUnits) * 100n) / maxCost) : 0}px` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <SectionCard title={t('hr.overview.costByDepartment')}>
            <table className="w-full text-sm">
              <tbody>
                {(data.costByDepartment ?? []).map((d) => (
                  <tr key={d.departmentName ?? '—'} className="border-t first:border-t-0">
                    <td className="py-1.5">{d.departmentName ?? t('hr.overview.noDepartment')}</td>
                    <td className="py-1.5 text-end tabular-nums">{formatAmount(d.expenseMinorUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
